import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { AuditService } from './audit/audit.service.js';
import { ScopeService } from './scope.service.js';
import { DocumentsService } from './documents/documents.service.js';
import { PostingService } from './documents/posting.service.js';
import { BalancesService } from './documents/balances.service.js';
import { RequestsService } from './requests/requests.service.js';
import { InventoryService } from './inventory/inventory.service.js';
import { ReportsService } from './reports/reports.service.js';
import { ItemsService } from './items/items.service.js';
import { ExcelService } from './excel/excel.service.js';

const audit = { record: vi.fn() } as unknown as AuditService;

beforeEach(() => vi.clearAllMocks());

// ─── DocumentsService.create: валидации §5.1 ──────────────────────────────────
describe('DocumentsService.create', () => {
  function setup(item: Record<string, unknown> = { id: 'i1', name: 'Шампунь', unit: 'шт', trackExpiry: false, trackBatches: false }) {
    const prisma = {
      whWarehouse: { findUnique: vi.fn().mockResolvedValue({ id: 'wh-c', addressId: null }) },
      whItem: { findMany: vi.fn().mockResolvedValue([item]) },
      whDocument: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'doc1', ...data })),
      },
    } as unknown as PrismaService;
    return { service: new DocumentsService(prisma, audit), prisma };
  }
  const line = { itemId: 'i1', quantity: 5, price: 100 };

  it('отклоняет тип не RECEIPT (на этом этапе)', async () => {
    const { service } = setup();
    await expect(service.create({ type: 'ISSUE', lines: [line] } as never, 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('требует склад-получатель для прихода', async () => {
    const { service } = setup();
    await expect(service.create({ type: 'RECEIPT', lines: [line] } as never, 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('запрещает нулевое количество', async () => {
    const { service } = setup();
    await expect(
      service.create({ type: 'RECEIPT', toWarehouseId: 'wh-c', lines: [{ itemId: 'i1', quantity: 0, price: 100 }] } as never, 'a1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('требует срок годности для товара с учётом сроков', async () => {
    const { service } = setup({ id: 'i1', name: 'Вода', unit: 'шт', trackExpiry: true, trackBatches: false });
    await expect(
      service.create({ type: 'RECEIPT', toWarehouseId: 'wh-c', lines: [line] } as never, 'a1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('создаёт черновик прихода с суммой и номером, пишет аудит', async () => {
    const { service, prisma } = setup();
    await service.create({ type: 'RECEIPT', toWarehouseId: 'wh-c', lines: [line] } as never, 'a1');
    const arg = vi.mocked(prisma.whDocument.create).mock.calls[0][0];
    expect(arg.data.amount).toBe(500);
    expect(arg.data.status).toBe('DRAFT');
    expect(arg.data.number).toBe('ПР-00001');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'created', entity: 'WhDocument' }));
  });
});

// ─── PostingService.post: движения + остатки (§14) ────────────────────────────
describe('PostingService.post', () => {
  function setup(doc: Record<string, unknown>, existingBalance: Record<string, unknown> | null) {
    const tx = {
      whBalance: {
        findUnique: vi.fn().mockResolvedValue(existingBalance),
        create: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn().mockResolvedValue([{ quantity: 5, avgCost: 100 }]),
      },
      whMovement: { create: vi.fn() },
      whItem: { update: vi.fn() },
      whDocument: { update: vi.fn().mockResolvedValue({ id: 'doc1', status: 'POSTED' }) },
    };
    const prisma = {
      whDocument: { findUnique: vi.fn().mockResolvedValue(doc) },
      whWarehouse: { findUnique: vi.fn().mockResolvedValue({ id: 'wh-c', addressId: null }) },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    return { service: new PostingService(prisma, audit), prisma, tx };
  }
  const draftReceipt = {
    id: 'doc1', status: 'DRAFT', type: 'RECEIPT', toWarehouseId: 'wh-c', number: 'ПР-00001', amount: 500,
    lines: [{ itemId: 'i1', quantity: 5, price: 100, amount: 500, batch: null, expiryDate: null }],
  };

  it('новый остаток: создаёт WhBalance и движение прихода, проводит документ', async () => {
    const { service, tx } = setup(draftReceipt, null);
    await service.post('doc1', 'a1');
    expect(tx.whBalance.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantity: 5, avgCost: 100 }) }));
    expect(tx.whMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantityIn: 5, quantityOut: 0 }) }));
    expect(tx.whDocument.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'POSTED' }) }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'posted' }), tx);
  });

  it('существующий остаток: средневзвешенная себестоимость', async () => {
    // было 10 шт по 20 ₽, приход 10 шт по 30 ₽ → 20 шт по 25 ₽
    const doc = { ...draftReceipt, lines: [{ itemId: 'i1', quantity: 10, price: 30, amount: 300, batch: null, expiryDate: null }] };
    const { service, tx } = setup(doc, { id: 'b1', quantity: 10, avgCost: 20, expiryDate: null });
    await service.post('doc1', 'a1');
    expect(tx.whBalance.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'b1' }, data: expect.objectContaining({ quantity: 20, avgCost: 25 }) }),
    );
  });

  it('нельзя провести уже проведённый документ', async () => {
    const { service } = setup({ ...draftReceipt, status: 'POSTED' }, null);
    await expect(service.post('doc1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('нельзя провести отменённый документ', async () => {
    const { service } = setup({ ...draftReceipt, status: 'CANCELLED' }, null);
    await expect(service.post('doc1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── BalancesService.list: скоуп по адресам и видимость цен ────────────────────
describe('BalancesService.list', () => {
  const row = {
    id: 'b1', warehouseId: 'wh-c', itemId: 'i1', batch: '', expiryDate: null, quantity: 3, reserved: 0, avgCost: 100,
    item: { id: 'i1', name: 'Шампунь', sku: null, unit: 'шт', minStock: 50, category: { name: 'Косметика' } },
    warehouse: { id: 'wh-c', name: 'Центральный склад', type: 'CENTRAL', address: null },
  };
  function setup(allowed: string[]) {
    const prisma = { whBalance: { findMany: vi.fn().mockResolvedValue([row]) } } as unknown as PrismaService;
    const scope = { allowedAddressIds: vi.fn().mockResolvedValue(allowed) } as unknown as ScopeService;
    return { service: new BalancesService(prisma, scope), prisma };
  }

  it('скрывает закупочные цены без права wh_costs', async () => {
    const { service } = setup([]);
    const [r] = await service.list({}, 'a1', false);
    expect(r.avgCost).toBeNull();
    expect(r.amount).toBeNull();
    expect(r.belowMin).toBe(true); // 3 < minStock 50
  });

  it('показывает цены и стоимость при наличии права', async () => {
    const { service } = setup([]);
    const [r] = await service.list({}, 'a1', true);
    expect(r.avgCost).toBe(100);
    expect(r.amount).toBe(300);
  });

  it('ограничивает выборку доступными адресами сотрудника', async () => {
    const { service, prisma } = setup(['addr1']);
    await service.list({}, 'a1', true);
    const where = vi.mocked(prisma.whBalance.findMany).mock.calls[0][0]?.where as { warehouse?: { addressId?: { in?: string[] } } };
    expect(where.warehouse?.addressId?.in).toEqual(['addr1']);
  });
});

// ─── PostingService: двухфазное перемещение (§5.3) ─────────────────────────────
describe('PostingService TRANSFER (две фазы)', () => {
  const transferDoc = {
    id: 'doc1', status: 'DRAFT', type: 'TRANSFER', number: 'ПМ-00001', fromWarehouseId: 'wh-c', toWarehouseId: 'wh-a',
    lines: [{ id: 'l1', itemId: 'i1', quantity: 30, price: 0, amount: 0, batch: null, expiryDate: null }],
  };

  it('post() отклоняет перемещение (нужны отгрузка/получение)', async () => {
    const prisma = { whDocument: { findUnique: vi.fn().mockResolvedValue(transferDoc) } } as unknown as PrismaService;
    await expect(new PostingService(prisma, audit).post('doc1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── Фаза 1: отгрузка ──
  function shipSetup(sources: Record<string, unknown>[]) {
    const tx = {
      whBalance: { findMany: vi.fn().mockResolvedValue(sources), update: vi.fn() },
      whMovement: { create: vi.fn() },
      whDocumentLine: { update: vi.fn() },
      whDocument: { update: vi.fn().mockResolvedValue({ id: 'doc1', status: 'SHIPPED' }) },
    };
    const prisma = {
      whDocument: { findUnique: vi.fn().mockResolvedValue(transferDoc) },
      whWarehouse: { findUnique: vi.fn().mockResolvedValue({ id: 'wh-c', addressId: null }) },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    return { service: new PostingService(prisma, audit), tx };
  }

  it('ship(): списывает с отправителя, фиксирует отгруженное, статус «в пути»', async () => {
    const { service, tx } = shipSetup([{ id: 'src', quantity: 100, reserved: 0, avgCost: 18, batch: '', expiryDate: null }]);
    await service.ship('doc1', 'a1');
    expect(tx.whBalance.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'src' }, data: { quantity: 70 } }));
    expect(tx.whDocumentLine.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'l1' }, data: expect.objectContaining({ shippedQty: 30, shippedCost: 18 }) }));
    expect(tx.whDocument.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'SHIPPED' } }));
  });

  it('ship(): запрещает отгрузку больше доступного остатка (§5.3)', async () => {
    const { service } = shipSetup([{ id: 'src', quantity: 10, reserved: 0, avgCost: 18, batch: '', expiryDate: null }]);
    await expect(service.ship('doc1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });

  // ── Фаза 2: получение с недостачей ──
  it('receive(): зачисляет фактическое, фиксирует недостачу и акт расхождения', async () => {
    const shippedDoc = {
      id: 'doc1', status: 'SHIPPED', type: 'TRANSFER', number: 'ПМ-00001', toWarehouseId: 'wh-a',
      lines: [{ id: 'l1', itemId: 'i1', quantity: 30, shippedQty: 30, shippedCost: 18, shippedBatch: null, shippedExpiry: null, price: 0, batch: null, expiryDate: null }],
    };
    const tx = {
      whBalance: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
      whMovement: { create: vi.fn() },
      whDocumentLine: { update: vi.fn() },
      whDocument: { update: vi.fn().mockResolvedValue({ id: 'doc1', status: 'POSTED', discrepancy: true }) },
    };
    const prisma = {
      whDocument: { findUnique: vi.fn().mockResolvedValue(shippedDoc) },
      whWarehouse: { findUnique: vi.fn().mockResolvedValue({ id: 'wh-a', addressId: 'addr' }) },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    const service = new PostingService(prisma, audit);

    await service.receive('doc1', [{ lineId: 'l1', receivedQty: 25 }], 'a1');
    expect(tx.whBalance.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantity: 25, avgCost: 18 }) }));
    expect(tx.whDocumentLine.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'l1' }, data: { receivedQty: 25 } }));
    expect(tx.whDocument.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'POSTED', discrepancy: true }) }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'discrepancy', payload: expect.objectContaining({ shortage: 5 }) }), tx);
  });
});

// ─── RequestsService: заявки на пополнение (§5.2, §5.7) ────────────────────────
describe('RequestsService', () => {
  it('рекомендация = par − доступный остаток, только позиции с par', async () => {
    const prisma = {
      whWarehouse: { findMany: vi.fn().mockResolvedValue([{ id: 'wh-a' }]) },
      whItem: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'i1', name: 'Шампунь', unit: 'шт', parStock: 200 },
          { id: 'i2', name: 'Лампа', unit: 'шт', parStock: null },
        ]),
      },
      whBalance: { findMany: vi.fn().mockResolvedValue([{ itemId: 'i1', quantity: 50, reserved: 0 }]) },
      whParLevel: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const svc = new RequestsService(prisma, audit);
    const recs = await svc.recommendations('addr1');
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ itemId: 'i1', par: 200, available: 50, recommend: 150 });
  });

  it('createTransfer создаёт перемещение ЦС→адрес и переводит заявку в работу', async () => {
    const update = vi.fn();
    const create = vi.fn().mockResolvedValue({ id: 'doc1', number: 'ПМ-00001' });
    const prisma = {
      whReplenishmentRequest: {
        findUnique: vi.fn().mockResolvedValue({ id: 'r1', status: 'APPROVED', number: 'ЗП-00001', addressId: 'addr1', lines: [{ itemId: 'i1', quantity: 30 }] }),
        update,
      },
      whWarehouse: { findFirst: vi.fn().mockResolvedValueOnce({ id: 'wh-c' }).mockResolvedValueOnce({ id: 'wh-a' }) },
      whDocument: { count: vi.fn().mockResolvedValue(0), create },
    } as unknown as PrismaService;
    const svc = new RequestsService(prisma, audit);
    await svc.createTransfer('r1', 'a1');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: 'TRANSFER', fromWarehouseId: 'wh-c', toWarehouseId: 'wh-a' }) }),
    );
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'IN_PROGRESS' } }));
  });

  it('createTransfer запрещён без согласования', async () => {
    const prisma = {
      whReplenishmentRequest: { findUnique: vi.fn().mockResolvedValue({ id: 'r1', status: 'SUBMITTED', addressId: 'a' }) },
    } as unknown as PrismaService;
    const svc = new RequestsService(prisma, audit);
    await expect(svc.createTransfer('r1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── Списание (§5.4, §17.7) ───────────────────────────────────────────────────
describe('Списание (WRITE_OFF)', () => {
  it('создание списания требует причину (§5.4)', async () => {
    const prisma = {
      whWarehouse: { findUnique: vi.fn().mockResolvedValue({ id: 'wh', addressId: null }) },
      whItem: { findMany: vi.fn().mockResolvedValue([{ id: 'i1', name: 'X', unit: 'шт', avgPrice: 10 }]) },
      whDocument: { count: vi.fn().mockResolvedValue(0), create: vi.fn() },
    } as unknown as PrismaService;
    const svc = new DocumentsService(prisma, audit);
    await expect(svc.create({ type: 'WRITE_OFF', fromWarehouseId: 'wh', lines: [{ itemId: 'i1', quantity: 2 }] } as never, 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('крупное списание создаётся со статусом «на согласовании»', async () => {
    const create = vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => ({ id: 'd1', ...data }));
    const prisma = {
      whWarehouse: { findUnique: vi.fn().mockResolvedValue({ id: 'wh', addressId: null }) },
      whItem: { findMany: vi.fn().mockResolvedValue([{ id: 'i1', name: 'X', unit: 'шт', avgPrice: 1000 }]) },
      whDocument: { count: vi.fn().mockResolvedValue(0), create },
    } as unknown as PrismaService;
    const svc = new DocumentsService(prisma, audit);
    await svc.create({ type: 'WRITE_OFF', fromWarehouseId: 'wh', reason: 'BREAKAGE', lines: [{ itemId: 'i1', quantity: 10 }] } as never, 'a1');
    const arg = vi.mocked(create).mock.calls[0][0];
    expect(arg.data.amount).toBe(10000);
    expect(arg.data.status).toBe('PENDING_APPROVAL'); // 10000 > лимит 5000
    expect(arg.data.reason).toBe('BREAKAGE');
  });

  function woSetup(doc: Record<string, unknown>, sources: Record<string, unknown>[]) {
    const tx = {
      whBalance: { findMany: vi.fn().mockResolvedValue(sources), update: vi.fn() },
      whMovement: { create: vi.fn() },
      whDocument: { update: vi.fn().mockResolvedValue({ id: 'd1', status: 'POSTED' }) },
    };
    const prisma = {
      whDocument: { findUnique: vi.fn().mockResolvedValue(doc) },
      whWarehouse: { findUnique: vi.fn().mockResolvedValue({ id: 'wh', addressId: 'a' }) },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    return { service: new PostingService(prisma, audit), tx };
  }
  const smallWo = {
    id: 'd1', status: 'DRAFT', type: 'WRITE_OFF', number: 'СП-00001', fromWarehouseId: 'wh', reason: 'USED', amount: 200,
    lines: [{ id: 'l1', itemId: 'i1', quantity: 5, price: 40, amount: 200, batch: null, expiryDate: null }],
  };
  const src = [{ id: 'src', quantity: 50, reserved: 0, avgCost: 40, batch: '', expiryDate: null }];

  it('проводит списание: FEFO-выбытие со склада, статус POSTED', async () => {
    const { service, tx } = woSetup(smallWo, src);
    await service.post('d1', 'a1');
    expect(tx.whBalance.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'src' }, data: { quantity: 45 } }));
    expect(tx.whMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantityOut: 5, quantityIn: 0 }) }));
    expect(tx.whDocument.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'POSTED' }) }));
  });

  it('крупное списание без согласования отклоняется (§17.7)', async () => {
    const { service } = woSetup({ ...smallWo, amount: 9000 }, src);
    await expect(service.post('d1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('крупное списание после согласования проводится', async () => {
    const { service, tx } = woSetup({ ...smallWo, amount: 9000, status: 'APPROVED' }, src);
    await service.post('d1', 'a1');
    expect(tx.whDocument.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'POSTED' }) }));
  });

  it('approve переводит списание в APPROVED', async () => {
    const update = vi.fn().mockResolvedValue({ status: 'APPROVED' });
    const prisma = {
      whDocument: { findUnique: vi.fn().mockResolvedValue({ id: 'd1', type: 'WRITE_OFF', status: 'PENDING_APPROVAL', number: 'СП-00001' }), update },
    } as unknown as PrismaService;
    await new PostingService(prisma, audit).approve('d1', 'a1');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'APPROVED' } }));
  });
});

// ─── Возврат с адреса + склад брака (§5.5) ────────────────────────────────────
describe('Возврат (RETURN)', () => {
  it('создание возврата требует причину', async () => {
    const prisma = {
      whWarehouse: { findUnique: vi.fn().mockResolvedValue({ id: 'wh-addr', addressId: 'addr' }) },
      whItem: { findMany: vi.fn().mockResolvedValue([{ id: 'i1', name: 'X', unit: 'шт', avgPrice: 10 }]) },
      whDocument: { count: vi.fn().mockResolvedValue(0), create: vi.fn() },
    } as unknown as PrismaService;
    await expect(
      new DocumentsService(prisma, audit).create({ type: 'RETURN', fromWarehouseId: 'wh-addr', lines: [{ itemId: 'i1', quantity: 2 }] } as never, 'a1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  function retSetup(doc: Record<string, unknown>, sources: Record<string, unknown>[]) {
    const tx = {
      whBalance: { findMany: vi.fn().mockResolvedValue(sources), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn(), update: vi.fn() },
      whMovement: { create: vi.fn() },
      whDocument: { update: vi.fn().mockResolvedValue({ id: 'd1', status: 'POSTED' }) },
    };
    const prisma = {
      whDocument: { findUnique: vi.fn().mockResolvedValue(doc) },
      whWarehouse: {
        findUnique: vi.fn().mockResolvedValue({ id: 'wh-addr', addressId: 'addr' }),
        findFirst: vi.fn().mockImplementation(({ where }: { where: { type: string } }) => Promise.resolve({ id: where.type === 'DEFECT' ? 'wh-defect' : 'wh-central', addressId: null })),
      },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    return { service: new PostingService(prisma, audit), tx, prisma };
  }
  const src = [{ id: 'src', quantity: 50, reserved: 0, avgCost: 35, batch: '', expiryDate: null }];
  const retLine = { id: 'l1', itemId: 'i1', quantity: 10, price: 0, amount: 0, batch: null, expiryDate: null };

  it('годный возврат: списывает с адреса, зачисляет на центральный склад', async () => {
    const { service, tx, prisma } = retSetup({ id: 'd1', status: 'DRAFT', type: 'RETURN', number: 'ВЗ-00001', fromWarehouseId: 'wh-addr', reason: 'OTHER', lines: [retLine] }, src);
    await service.post('d1', 'a1');
    expect(tx.whBalance.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'src' }, data: { quantity: 40 } }));
    expect(tx.whBalance.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ warehouseId: 'wh-central', quantity: 10, avgCost: 35 }) }));
    expect(vi.mocked(prisma.whWarehouse.findFirst)).toHaveBeenCalledWith(expect.objectContaining({ where: { type: 'CENTRAL' } }));
  });

  it('возврат брака: зачисляет на склад брака', async () => {
    const { service, tx, prisma } = retSetup({ id: 'd1', status: 'DRAFT', type: 'RETURN', number: 'ВЗ-00002', fromWarehouseId: 'wh-addr', reason: 'DEFECT', lines: [retLine] }, src);
    await service.post('d1', 'a1');
    expect(tx.whBalance.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ warehouseId: 'wh-defect' }) }));
    expect(vi.mocked(prisma.whWarehouse.findFirst)).toHaveBeenCalledWith(expect.objectContaining({ where: { type: 'DEFECT' } }));
  });

  it('нельзя вернуть больше, чем числится на адресе', async () => {
    const { service } = retSetup({ id: 'd1', status: 'DRAFT', type: 'RETURN', number: 'ВЗ-00003', fromWarehouseId: 'wh-addr', reason: 'OTHER', lines: [{ ...retLine, quantity: 999 }] }, [{ id: 'src', quantity: 5, reserved: 0, avgCost: 35, batch: '', expiryDate: null }]);
    await expect(service.post('d1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── Инвентаризация (§5.6) ────────────────────────────────────────────────────
describe('InventoryService', () => {
  it('start снимает учётный остаток в строки', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'inv1', lines: [{}] });
    const prisma = {
      whWarehouse: { findUnique: vi.fn().mockResolvedValue({ id: 'wh', addressId: null }) },
      whBalance: { findMany: vi.fn().mockResolvedValue([{ itemId: 'i1', batch: '', expiryKey: '', expiryDate: null, quantity: 30, avgCost: 18 }]) },
      whInventory: {
        count: vi.fn().mockResolvedValue(0),
        create,
        findUnique: vi.fn().mockResolvedValue({ id: 'inv1', number: 'ИНВ-00001', lines: [{ id: 'l1', itemId: 'i1', bookQuantity: 30, factQuantity: null, price: 18, batch: '', expiryKey: '', expiryDate: null, item: { id: 'i1', name: 'X', unit: 'шт' } }] }),
      },
    } as unknown as PrismaService;
    await new InventoryService(prisma, audit).start({ warehouseId: 'wh' } as never, 'a1');
    const arg = vi.mocked(create).mock.calls[0][0] as { data: { lines: { create: Record<string, unknown>[] } } };
    expect(arg.data.lines.create[0]).toMatchObject({ itemId: 'i1', bookQuantity: 30, price: 18 });
  });

  it('submit требует причину для недостачи (§5.6)', async () => {
    const prisma = {
      whInventory: { findUnique: vi.fn().mockResolvedValue({ id: 'inv1', status: 'DRAFT', number: 'ИНВ-1', lines: [{ id: 'l1', bookQuantity: 30, factQuantity: 25, reason: null }] }) },
    } as unknown as PrismaService;
    await expect(new InventoryService(prisma, audit).submit('inv1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('approve приводит остаток к факту и создаёт корректировку', async () => {
    const tx = {
      whDocument: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({ id: 'corr', number: 'КР-00001' }) },
      whBalance: { findUnique: vi.fn().mockResolvedValue({ id: 'b1', quantity: 30 }), update: vi.fn(), create: vi.fn() },
      whMovement: { create: vi.fn() },
      whInventory: { update: vi.fn().mockResolvedValue({ id: 'inv1', status: 'POSTED' }) },
    };
    const prisma = {
      whInventory: { findUnique: vi.fn().mockResolvedValue({ id: 'inv1', status: 'PENDING_APPROVAL', number: 'ИНВ-1', warehouseId: 'wh', lines: [{ id: 'l1', itemId: 'i1', batch: '', expiryKey: '', expiryDate: null, bookQuantity: 30, factQuantity: 25, price: 18 }] }) },
      whWarehouse: { findUnique: vi.fn().mockResolvedValue({ id: 'wh', addressId: 'a' }) },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
    } as unknown as PrismaService;
    await new InventoryService(prisma, audit).approve('inv1', 'a1', ['wh_inventory']);
    expect(tx.whBalance.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'b1' }, data: { quantity: 25 } }));
    expect(tx.whMovement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ quantityOut: 5, documentType: 'CORRECTION' }) }));
    expect(tx.whInventory.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'POSTED' }) }));
  });

  it('крупное расхождение без права руководителя отклоняется (§5.6)', async () => {
    const prisma = {
      whInventory: { findUnique: vi.fn().mockResolvedValue({ id: 'inv1', status: 'PENDING_APPROVAL', number: 'ИНВ-1', warehouseId: 'wh', lines: [{ id: 'l1', itemId: 'i1', batch: '', expiryKey: '', bookQuantity: 100, factQuantity: 0, price: 100 }] }) },
      whWarehouse: { findUnique: vi.fn().mockResolvedValue({ id: 'wh', addressId: 'a' }) },
    } as unknown as PrismaService;
    await expect(new InventoryService(prisma, audit).approve('inv1', 'a1', ['wh_inventory'])).rejects.toBeInstanceOf(ForbiddenException);
  });
});

// ─── Нормы расхода и перерасход (§7, §6.7.14) ─────────────────────────────────
describe('ReportsService.overspend', () => {
  it('норматив = норма × база; перерасход против факта (списаний)', async () => {
    const prisma = {
      whConsumptionNorm: { findMany: vi.fn().mockResolvedValue([{ itemId: 'i1', addressId: null, unit: 'ROOM_NIGHT', normQuantity: 1, item: { id: 'i1', name: 'Шампунь', unit: 'шт' } }]) },
      whWarehouse: { findMany: vi.fn().mockResolvedValue([{ id: 'wh-a' }]) },
      whMovement: { findMany: vi.fn().mockResolvedValue([{ itemId: 'i1', quantityOut: 12 }]) },
    } as unknown as PrismaService;
    const rows = await new ReportsService(prisma).overspend({ addressId: 'addr1', from: new Date('2026-06-01'), to: new Date('2026-06-30'), roomNights: 10, stays: 0, guests: 0, cleanings: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ normative: 10, actual: 12, overspend: 2, overspent: true });
  });

  it('адресная норма важнее общей', async () => {
    const prisma = {
      whConsumptionNorm: {
        findMany: vi.fn().mockResolvedValue([
          { itemId: 'i1', addressId: null, unit: 'ROOM_NIGHT', normQuantity: 1, item: { id: 'i1', name: 'X', unit: 'шт' } },
          { itemId: 'i1', addressId: 'addr1', unit: 'ROOM_NIGHT', normQuantity: 2, item: { id: 'i1', name: 'X', unit: 'шт' } },
        ]),
      },
      whWarehouse: { findMany: vi.fn().mockResolvedValue([{ id: 'wh-a' }]) },
      whMovement: { findMany: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const rows = await new ReportsService(prisma).overspend({ addressId: 'addr1', from: new Date(), to: new Date(), roomNights: 10, stays: 0, guests: 0, cleanings: 0 });
    expect(rows[0].normative).toBe(20); // адресная норма 2 × 10 номеро-суток
  });

  it('consumption группирует расход по адресам (§6.7.3)', async () => {
    const prisma = {
      whMovement: {
        findMany: vi.fn().mockResolvedValue([
          { itemId: 'i1', addressId: 'a1', quantityOut: 5, amount: 90 },
          { itemId: 'i2', addressId: 'a1', quantityOut: 3, amount: 30 },
          { itemId: 'i1', addressId: 'a2', quantityOut: 2, amount: 36 },
        ]),
      },
      whItem: { findMany: vi.fn().mockResolvedValue([{ id: 'i1', name: 'A', unit: 'шт', categoryId: 'c1', category: { name: 'Кат' } }, { id: 'i2', name: 'B', unit: 'шт', categoryId: 'c1', category: { name: 'Кат' } }]) },
      whAddress: { findMany: vi.fn().mockResolvedValue([{ id: 'a1', name: 'Адрес1' }, { id: 'a2', name: 'Адрес2' }]) },
    } as unknown as PrismaService;
    const rows = await new ReportsService(prisma).consumption({ from: new Date(), to: new Date(), groupBy: 'address' });
    const a1 = rows.find((r) => r.label === 'Адрес1')!;
    expect(a1.amount).toBe(120); // 90 + 30
    expect(a1.quantity).toBe(8);
  });

  it('stockValue суммирует стоимость по складам (§6.7.12)', async () => {
    const prisma = {
      whBalance: {
        findMany: vi.fn().mockResolvedValue([
          { warehouseId: 'w1', quantity: 10, reserved: 0, avgCost: 18, warehouse: { id: 'w1', name: 'ЦС', type: 'CENTRAL' } },
          { warehouseId: 'w1', quantity: 5, reserved: 0, avgCost: 40, warehouse: { id: 'w1', name: 'ЦС', type: 'CENTRAL' } },
        ]),
      },
    } as unknown as PrismaService;
    const rows = await new ReportsService(prisma).stockValue();
    expect(rows[0]).toMatchObject({ name: 'ЦС', positions: 2, value: 380 }); // 10×18 + 5×40
  });
});

// ─── Excel импорт/экспорт (§18) ───────────────────────────────────────────────
describe('Excel', () => {
  it('build/parse round-trip', () => {
    const svc = new ExcelService();
    const buf = svc.build('Лист', [{ key: 'name', label: 'Название' }, { key: 'qty', label: 'Кол-во' }], [{ name: 'A', qty: 5 }]);
    const rows = svc.parse(buf);
    expect(rows[0]).toMatchObject({ Название: 'A', 'Кол-во': 5 });
  });

  it('importItems создаёт новые и заводит категорию', async () => {
    const created: Record<string, unknown>[] = [];
    const prisma = {
      whCategory: { findMany: vi.fn().mockResolvedValue([]), create: vi.fn().mockResolvedValue({ id: 'c1', name: 'Косметика' }) },
      whItem: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) => { created.push(data); return { id: 'x' }; }),
        update: vi.fn(),
      },
    } as unknown as PrismaService;
    const res = await new ItemsService(prisma).importItems([
      { Название: 'Шампунь', Артикул: 'SH-1', Категория: 'Косметика', 'Единица измерения': 'шт', Цена: 18, 'Минимальный остаток': 50 },
      { Название: '' },
    ]);
    expect(res.created).toBe(1);
    expect(res.skipped).toBe(1);
    expect(prisma.whCategory.create).toHaveBeenCalledWith(expect.objectContaining({ data: { name: 'Косметика' } }));
    expect(created[0]).toMatchObject({ name: 'Шампунь', sku: 'SH-1', unit: 'шт', lastPurchasePrice: 18, minStock: 50 });
  });

  it('importItems обновляет существующий по артикулу', async () => {
    const prisma = {
      whCategory: { findMany: vi.fn().mockResolvedValue([]) },
      whItem: { findUnique: vi.fn().mockResolvedValue({ id: 'e1' }), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    } as unknown as PrismaService;
    const res = await new ItemsService(prisma).importItems([{ Название: 'X', Артикул: 'A1' }]);
    expect(res.updated).toBe(1);
    expect(prisma.whItem.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'e1' } }));
  });
});
