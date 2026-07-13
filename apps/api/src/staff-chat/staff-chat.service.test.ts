import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { StaffChatService } from './staff-chat.service.js';
import type { AttachmentStorageService } from './attachment-storage.service.js';
import type { StaffChatEvents } from './staff-chat.events.js';
import type { PrismaService } from '../common/prisma/prisma.service.js';

function mk() {
  const prisma = {
    adminUser: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    staffChat: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'newChat' }),
      update: vi.fn().mockResolvedValue({}),
    },
    staffChatMember: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
    staffMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'msg', senderId: 'u1', text: 'привет', createdAt: new Date() }),
      update: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    staffMessageReaction: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    staffSavedMessage: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    staffChatFolder: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'f1' }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
  };
  const storage = {
    save: vi.fn().mockResolvedValue({
      url: '/uploads/x.png',
      name: 'x.png',
      size: 10,
      mime: 'image/png',
      kind: 'IMAGE',
    }),
  };
  const events = { publish: vi.fn() };
  return {
    prisma,
    storage,
    events,
    svc: new StaffChatService(
      prisma as unknown as PrismaService,
      storage as unknown as AttachmentStorageService,
      events as unknown as StaffChatEvents,
    ),
  };
}

describe('StaffChatService', () => {
  it('createDm возвращает существующий DM по dmKey (без создания)', async () => {
    const { prisma, svc } = mk();
    prisma.adminUser.findFirst.mockResolvedValue({ id: 'u2' });
    prisma.staffChat.findUnique.mockResolvedValue({ id: 'chatX' });
    const res = await svc.createDm('t1', 'u1', 'u2');
    expect(res).toEqual({ id: 'chatX' });
    expect(prisma.staffChat.findUnique).toHaveBeenCalledWith({ where: { dmKey: 't1:u1:u2' } });
    expect(prisma.staffChat.create).not.toHaveBeenCalled();
  });

  it('createDm создаёт DM с отсортированным dmKey (порядок аргументов не важен)', async () => {
    const { prisma, svc } = mk();
    prisma.adminUser.findFirst.mockResolvedValue({ id: 'u2' });
    prisma.staffChat.findUnique.mockResolvedValue(null);
    prisma.staffChat.create.mockResolvedValue({ id: 'newChat' });
    const res = await svc.createDm('t1', 'u2', 'u1');
    expect(res).toEqual({ id: 'newChat' });
    const arg = prisma.staffChat.create.mock.calls[0]![0] as { data: { dmKey: string; kind: string } };
    expect(arg.data.dmKey).toBe('t1:u1:u2');
    expect(arg.data.kind).toBe('DM');
  });

  it('createDm с самим собой запрещён', async () => {
    const { svc } = mk();
    await expect(svc.createDm('t1', 'u1', 'u1')).rejects.toThrow(ForbiddenException);
  });

  it('send требует членства в чате', async () => {
    const { prisma, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue(null);
    await expect(svc.send('c1', 'u1', 'hi')).rejects.toThrow(ForbiddenException);
    expect(prisma.staffMessage.create).not.toHaveBeenCalled();
  });

  it('send создаёт сообщение и отмечает чат прочитанным для отправителя', async () => {
    const { prisma, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm' });
    const res = await svc.send('c1', 'u1', 'привет');
    expect(prisma.staffMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ chatId: 'c1', senderId: 'u1', text: 'привет' }),
    });
    expect(prisma.staffChatMember.update).toHaveBeenCalled();
    expect(res.id).toBe('msg');
  });

  it('send публикует SSE-событие участникам чата', async () => {
    const { prisma, events, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm' });
    prisma.staffChatMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    await svc.send('c1', 'u1', 'привет');
    expect(events.publish).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: 'c1', memberIds: ['u1', 'u2'], kind: 'message' }),
    );
  });

  it('send сохраняет только @упоминания, которые есть в чате', async () => {
    const { prisma, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm' });
    prisma.staffChatMember.findMany.mockResolvedValue([{ userId: 'u2' }]); // из [u2,uX] в чате только u2
    await svc.send('c1', 'u1', 'привет @Пётр', undefined, ['u2', 'uX']);
    const arg = prisma.staffMessage.create.mock.calls[0]![0] as { data: { mentionIds: string[] } };
    expect(arg.data.mentionIds).toEqual(['u2']);
  });

  it('typing: показывает печатающих коллег, но не себя', async () => {
    const { prisma, svc } = mk();
    // memberChatOrThrow использует include: { chat: true } — вернём групповой чат (без «прочитано»).
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm', chat: { kind: 'GROUP' } });
    await svc.setTyping('c1', 'u2');
    const seenByU1 = await svc.messages('c1', 'u1');
    expect(seenByU1.typingUserIds).toContain('u2');
    const seenByU2 = await svc.messages('c1', 'u2');
    expect(seenByU2.typingUserIds).not.toContain('u2');
  });

  it('react добавляет реакцию, если её не было', async () => {
    const { prisma, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm' });
    prisma.staffMessage.findFirst.mockResolvedValue({ id: 'msg1' });
    prisma.staffMessageReaction.findUnique.mockResolvedValue(null);
    await svc.react('c1', 'u1', 'msg1', '👍');
    expect(prisma.staffMessageReaction.create).toHaveBeenCalledWith({
      data: { messageId: 'msg1', userId: 'u1', emoji: '👍' },
    });
  });

  it('react повторно снимает реакцию (toggle)', async () => {
    const { prisma, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm' });
    prisma.staffMessage.findFirst.mockResolvedValue({ id: 'msg1' });
    prisma.staffMessageReaction.findUnique.mockResolvedValue({ id: 'r1' });
    await svc.react('c1', 'u1', 'msg1', '👍');
    expect(prisma.staffMessageReaction.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    expect(prisma.staffMessageReaction.create).not.toHaveBeenCalled();
  });

  it('editMessage запрещает править чужое сообщение', async () => {
    const { prisma, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm' });
    prisma.staffMessage.findFirst.mockResolvedValue({ id: 'msg1', senderId: 'other', deletedAt: null });
    await expect(svc.editMessage('c1', 'u1', 'msg1', 'ha')).rejects.toThrow(ForbiddenException);
  });

  it('deleteMessage мягко помечает своё сообщение удалённым', async () => {
    const { prisma, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm' });
    prisma.staffMessage.findFirst.mockResolvedValue({ id: 'msg1', senderId: 'u1', deletedAt: null });
    await svc.deleteMessage('c1', 'u1', 'msg1');
    const arg = prisma.staffMessage.update.mock.calls[0]![0] as { where: unknown; data: { deletedAt: Date } };
    expect(arg.where).toEqual({ id: 'msg1' });
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
  });

  it('togglePin закрепляет незакреплённое сообщение', async () => {
    const { prisma, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm' });
    prisma.staffMessage.findFirst.mockResolvedValue({ id: 'msg1', deletedAt: null, pinnedAt: null });
    const res = await svc.togglePin('c1', 'u1', 'msg1');
    expect(res).toEqual({ pinned: true });
    const arg = prisma.staffMessage.update.mock.calls[0]![0] as { data: { pinnedAt: Date | null; pinnedById: string | null } };
    expect(arg.data.pinnedById).toBe('u1');
    expect(arg.data.pinnedAt).toBeInstanceOf(Date);
  });

  it('togglePin открепляет закреплённое (сбрасывает поля)', async () => {
    const { prisma, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm' });
    prisma.staffMessage.findFirst.mockResolvedValue({ id: 'msg1', deletedAt: null, pinnedAt: new Date() });
    const res = await svc.togglePin('c1', 'u1', 'msg1');
    expect(res).toEqual({ pinned: false });
    const arg = prisma.staffMessage.update.mock.calls[0]![0] as { data: { pinnedAt: Date | null; pinnedById: string | null } };
    expect(arg.data.pinnedAt).toBeNull();
    expect(arg.data.pinnedById).toBeNull();
  });

  it('search: слишком короткий запрос не идёт в БД', async () => {
    const { prisma, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm' });
    const res = await svc.search('c1', 'u1', 'a');
    expect(res).toEqual([]);
    expect(prisma.staffMessage.findMany).not.toHaveBeenCalled();
  });

  it('search: ищет по contains без учёта регистра', async () => {
    const { prisma, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm' });
    prisma.staffMessage.findMany.mockResolvedValue([
      { id: 'm1', senderId: 'u2', text: 'Привет', createdAt: new Date() },
    ]);
    const res = await svc.search('c1', 'u1', 'прив');
    expect(res).toHaveLength(1);
    const arg = prisma.staffMessage.findMany.mock.calls[0]![0] as { where: { text: unknown } };
    expect(arg.where.text).toEqual({ contains: 'прив', mode: 'insensitive' });
  });

  it('toggleSave добавляет в избранное, если сообщения там не было', async () => {
    const { prisma, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm' });
    prisma.staffMessage.findFirst.mockResolvedValue({ id: 'msg1' });
    prisma.staffSavedMessage.findUnique.mockResolvedValue(null);
    const res = await svc.toggleSave('c1', 'u1', 'msg1');
    expect(res).toEqual({ saved: true });
    expect(prisma.staffSavedMessage.create).toHaveBeenCalledWith({
      data: { userId: 'u1', messageId: 'msg1' },
    });
  });

  it('toggleSave убирает из избранного при повторе', async () => {
    const { prisma, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm' });
    prisma.staffMessage.findFirst.mockResolvedValue({ id: 'msg1' });
    prisma.staffSavedMessage.findUnique.mockResolvedValue({ id: 's1' });
    const res = await svc.toggleSave('c1', 'u1', 'msg1');
    expect(res).toEqual({ saved: false });
    expect(prisma.staffSavedMessage.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
  });

  it('updateFolder оставляет в составе только чаты, где пользователь состоит', async () => {
    const { prisma, svc } = mk();
    prisma.staffChatFolder.findFirst.mockResolvedValue({ id: 'f1', userId: 'u1' });
    prisma.staffChatMember.findMany.mockResolvedValue([{ chatId: 'cA' }]);
    await svc.updateFolder('u1', 'f1', { chatIds: ['cA', 'cB'] });
    const arg = prisma.staffChatFolder.update.mock.calls[0]![0] as { data: { chatIds: string[] } };
    expect(arg.data.chatIds).toEqual(['cA']);
  });

  it('sendWithAttachment сохраняет файл и создаёт сообщение с вложением', async () => {
    const { prisma, storage, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm' });
    prisma.staffMessage.create.mockResolvedValue({
      id: 'msg',
      senderId: 'u1',
      text: 'подпись',
      createdAt: new Date(),
      editedAt: null,
      deletedAt: null,
      pinnedAt: null,
      mentionIds: [],
      reactions: [],
      replyTo: null,
      attachments: [
        { id: 'a1', kind: 'IMAGE', url: '/uploads/x.png', name: 'x.png', size: 10, mime: 'image/png' },
      ],
    });
    const res = await svc.sendWithAttachment(
      'c1',
      'u1',
      { originalname: 'x.png' } as unknown as Express.Multer.File,
      'подпись',
    );
    expect(storage.save).toHaveBeenCalled();
    expect(res.attachments).toHaveLength(1);
    expect(res.attachments[0]?.kind).toBe('IMAGE');
  });

  it('setNotify выключает уведомления (NONE → muted)', async () => {
    const { prisma, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm' });
    prisma.staffChatMember.update.mockResolvedValue({ notifyMode: 'NONE', mutedUntil: null });
    const res = await svc.setNotify('c1', 'u1', { mode: 'NONE' });
    expect(res).toEqual({ notifyMode: 'NONE', muted: true });
    const arg = prisma.staffChatMember.update.mock.calls[0]![0] as { data: { notifyMode: string } };
    expect(arg.data.notifyMode).toBe('NONE');
  });

  it('setNotify заглушает на N часов (mutedUntil в будущем)', async () => {
    const { prisma, svc } = mk();
    prisma.staffChatMember.findUnique.mockResolvedValue({ id: 'm' });
    prisma.staffChatMember.update.mockResolvedValue({
      notifyMode: 'ALL',
      mutedUntil: new Date(Date.now() + 8 * 3_600_000),
    });
    const res = await svc.setNotify('c1', 'u1', { muteHours: 8 });
    expect(res.muted).toBe(true);
    const arg = prisma.staffChatMember.update.mock.calls[0]![0] as { data: { mutedUntil: Date } };
    expect(arg.data.mutedUntil).toBeInstanceOf(Date);
  });
});
