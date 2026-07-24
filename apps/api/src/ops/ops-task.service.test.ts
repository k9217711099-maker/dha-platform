import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { OpsTaskService, type OpsViewer, type SnapshotItem } from './ops-task.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AuditService } from '../warehouse/audit/audit.service.js';
import { OpsEvents } from './ops.events.js';

const audit = () => ({ record: vi.fn() }) as unknown as AuditService;
const viewer = (perms: string[] = []): OpsViewer => ({ id: 'u1', roleKey: 'ops_maid', perms: ['ops_tasks', ...perms] });

function setup(task: Record<string, unknown>) {
  const room = { update: vi.fn().mockResolvedValue({}) };
  const opsTask = {
    findFirst: vi.fn().mockResolvedValue(task),
    update: vi.fn().mockResolvedValue({ id: 't1', title: 'T', assignees: [], watchers: [] }),
  };
  const opsTaskChecklist = { findMany: vi.fn().mockResolvedValue([]) };
  const opsTaskComment = { create: vi.fn().mockResolvedValue({}) };
  const opsTaskAttachment = { count: vi.fn().mockResolvedValue(1) };
  const prisma = {
    opsTask,
    opsTaskChecklist,
    opsTaskComment,
    opsTaskAttachment,
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({ opsTask, room, opsTaskComment })),
  } as unknown as PrismaService;
  return { service: new OpsTaskService(prisma, audit(), new OpsEvents()), room, opsTask, opsTaskChecklist };
}

beforeEach(() => vi.clearAllMocks());

describe('OpsTaskService.changeStatus — статусная машина (§3.2)', () => {
  it('уборка DONE → номер CLEAN', async () => {
    const { service, room } = setup({ id: 't1', status: 'IN_PROGRESS', kind: 'CLEANING', roomId: 'r1', blocksSale: false, inProgressSince: new Date(), startedAt: new Date(), requirePhotoResult: false, createdBy: null });
    await service.changeStatus('tn', 't1', { to: 'DONE' }, viewer());
    expect(room.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ housekeepingStatus: 'CLEAN' }) }));
  });

  it('blocksSale: DONE возвращает номер в продажу (OK)', async () => {
    const { service, room } = setup({ id: 't1', status: 'IN_PROGRESS', kind: 'TASK', roomId: 'r1', blocksSale: true, inProgressSince: null, startedAt: new Date(), requirePhotoResult: false, createdBy: null });
    await service.changeStatus('tn', 't1', { to: 'DONE' }, viewer());
    expect(room.update).toHaveBeenCalledWith(expect.objectContaining({ data: { maintenanceStatus: 'OK' } }));
  });

  it('недопустимый переход NEW → DONE отклоняется', async () => {
    const { service } = setup({ id: 't1', status: 'NEW', kind: 'TASK', roomId: null, blocksSale: false, createdBy: null });
    await expect(service.changeStatus('tn', 't1', { to: 'DONE' }, viewer())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('отмена без причины отклоняется', async () => {
    const { service } = setup({ id: 't1', status: 'NEW', kind: 'TASK', roomId: null, blocksSale: false, createdBy: null });
    await expect(service.changeStatus('tn', 't1', { to: 'CANCELLED' }, viewer())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('переоткрытие без ops_manage запрещено', async () => {
    const { service } = setup({ id: 't1', status: 'DONE', kind: 'TASK', roomId: null, blocksSale: false, createdBy: null });
    await expect(service.changeStatus('tn', 't1', { to: 'NEW' }, viewer())).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('DONE блокируется незавершённым чек-листом (§5.3)', async () => {
    const { service, opsTaskChecklist } = setup({ id: 't1', status: 'IN_PROGRESS', kind: 'TASK', roomId: null, blocksSale: false, inProgressSince: null, startedAt: new Date(), requirePhotoResult: false, createdBy: null });
    opsTaskChecklist.findMany.mockResolvedValue([
      { id: 'cl1', name: 'Инспекция', itemsSnapshot: [{ id: 'i1', kind: 'ITEM', requirePhoto: false }], answers: [] },
    ]);
    await expect(service.changeStatus('tn', 't1', { to: 'DONE' }, viewer())).rejects.toBeInstanceOf(BadRequestException);
  });

  // Блокер отложенной задачи (workflow-ТЗ §2.1)
  const paused = (extra: Record<string, unknown> = {}) => ({ id: 't1', status: 'IN_PROGRESS', kind: 'TASK', roomId: null, blocksSale: false, inProgressSince: null, startedAt: new Date(), requirePhotoResult: false, requireConfirmation: false, dueAt: new Date(), createdBy: null, ...extra });

  it('PAUSED без причины блокера отклоняется', async () => {
    const { service } = setup(paused());
    await expect(service.changeStatus('tn', 't1', { to: 'PAUSED' }, viewer())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PAUSED без срока и без ожидаемой даты отклоняется', async () => {
    const { service } = setup(paused({ dueAt: null }));
    await expect(service.changeStatus('tn', 't1', { to: 'PAUSED', blockerKind: 'PARTS' }, viewer())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PAUSED «на дату» без даты отклоняется', async () => {
    const { service } = setup(paused());
    await expect(service.changeStatus('tn', 't1', { to: 'PAUSED', blockerKind: 'SCHEDULED' }, viewer())).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PAUSED c причиной и сроком пишет блокер и pausedSince', async () => {
    const { service, opsTask } = setup(paused());
    await service.changeStatus('tn', 't1', { to: 'PAUSED', blockerKind: 'PARTS', blockerNote: 'ждём фильтр' }, viewer());
    expect(opsTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PAUSED', blockerKind: 'PARTS', pausedSince: expect.any(Date) }) }));
  });

  it('выход из PAUSED снимает блокер', async () => {
    const { service, opsTask } = setup(paused({ status: 'PAUSED' }));
    await service.changeStatus('tn', 't1', { to: 'IN_PROGRESS' }, viewer());
    expect(opsTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS', blockerKind: null, pausedSince: null }) }));
  });

  // Возвратный шаг (workflow-ТЗ §6)
  const withFollowUp = (extra: Record<string, unknown> = {}) => ({ id: 't1', status: 'IN_PROGRESS', kind: 'TASK', roomId: null, blocksSale: false, inProgressSince: null, startedAt: new Date(), requirePhotoResult: false, requireConfirmation: false, createdBy: 'author1', propertyId: 'p1', followUpText: 'Позвонить гостю', followUpFiredAt: null, ...extra });

  it('закрытие задачи с возвратным шагом ставит followUpFiredAt', async () => {
    const { service, opsTask } = setup(withFollowUp());
    await service.changeStatus('tn', 't1', { to: 'DONE' }, viewer());
    expect(opsTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'DONE', followUpFiredAt: expect.any(Date) }) }));
  });

  it('повторное закрытие (firedAt уже стоит) не порождает возврат снова', async () => {
    const { service, opsTask } = setup(withFollowUp({ status: 'WAITING_CONFIRM', followUpFiredAt: new Date() }));
    await service.changeStatus('tn', 't1', { to: 'DONE' }, viewer(['ops_manage']));
    expect((opsTask.update.mock.calls[0]![0] as { data: Record<string, unknown> }).data.followUpFiredAt).toBeUndefined();
  });
});

describe('OpsTaskService.isChecklistComplete', () => {
  const svc = setup({}).service;
  const items = [
    { id: 'h', kind: 'HEADER', requirePhoto: false },
    { id: 'a', kind: 'ITEM', requirePhoto: false },
    { id: 'b', kind: 'ITEM', requirePhoto: true },
  ] as unknown as SnapshotItem[];

  it('заголовки не требуют ответа; фото-пункт требует фото', () => {
    expect(svc.isChecklistComplete(items, [{ itemId: 'a', photoUrl: null, answer: 'YES' }, { itemId: 'b', photoUrl: null, answer: 'YES' }])).toBe(false);
    expect(svc.isChecklistComplete(items, [{ itemId: 'a', photoUrl: null, answer: 'YES' }, { itemId: 'b', photoUrl: '/uploads/x.jpg', answer: 'YES' }])).toBe(true);
  });

  it('пункт только с комментарием (пустой ответ) не считается отвеченным', () => {
    expect(svc.isChecklistComplete(items, [{ itemId: 'a', photoUrl: null, answer: '' }, { itemId: 'b', photoUrl: '/uploads/x.jpg', answer: 'YES' }])).toBe(false);
  });
});

describe('OpsTaskService.comment — @упоминания (workflow §8.1)', () => {
  const mockPrisma = (over: Record<string, unknown> = {}) => ({
    opsTask: { findFirst: vi.fn().mockResolvedValue({ id: 't1', title: 'T', createdBy: 'author', status: 'NEW' }), update: vi.fn().mockResolvedValue({}) },
    opsTaskComment: { create: vi.fn().mockResolvedValue({ id: 'c1' }) },
    opsTaskAssignee: { findMany: vi.fn().mockResolvedValue([]) },
    opsTaskWatcher: { upsert: vi.fn().mockResolvedValue({}), findMany: vi.fn().mockResolvedValue([]) },
    adminUser: { findMany: vi.fn().mockResolvedValue([{ id: 'u2' }]) },
    ...over,
  }) as unknown as PrismaService;

  it('упомянутый становится наблюдателем и получает mention-событие', async () => {
    const emit = vi.fn();
    const prisma = mockPrisma();
    const svc = new OpsTaskService(prisma, audit(), { emit } as unknown as OpsEvents);
    await svc.comment('tn', 't1', 'смотри @Иван', viewer(), ['u2']);
    expect((prisma.opsTaskWatcher.upsert as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(expect.objectContaining({ create: { taskId: 't1', userId: 'u2' } }));
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ kind: 'mention', userIds: ['u2'], taskId: 't1' }));
  });

  it('упоминание самого себя игнорируется (mention не шлётся)', async () => {
    const emit = vi.fn();
    const svc = new OpsTaskService(mockPrisma({ adminUser: { findMany: vi.fn().mockResolvedValue([]) } }), audit(), { emit } as unknown as OpsEvents);
    await svc.comment('tn', 't1', 'сам себе', viewer(), ['u1']); // u1 = viewer.id
    expect(emit).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'mention' }));
  });
});
