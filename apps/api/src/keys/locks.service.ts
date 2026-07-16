import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { LockCoverage, LockTarget, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { TtlockPort } from '../integrations/ttlock/ttlock.port.js';

/** Prisma-ошибки БД → понятные сообщения (иначе клиент видит «Внутренняя ошибка сервера»). */
function asLockError(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === 'P2002') throw new ConflictException('Этот замок TTLock уже добавлен — он привязан к другой двери.');
    if (e.code === 'P2003' || e.code === 'P2025') {
      throw new BadRequestException('Указан несуществующий объект или номер — обновите список и повторите.');
    }
  }
  throw e;
}

/** Управление замками и их покрытием (админка, §17). */
@Injectable()
export class LocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ttlock: TtlockPort,
  ) {}

  /** Замки из аккаунта TTLock (живой список) — для выбора при привязке. */
  listTtlockLocks() {
    return this.ttlock.listLocks();
  }

  /** Замки в нашей БД (с привязанными номерами). */
  listLocks(propertyId?: string) {
    return this.prisma.lock.findMany({
      where: propertyId ? { propertyId } : undefined,
      include: {
        roomLinks: { select: { roomId: true } },
        property: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createLock(data: {
    propertyId: string;
    ttlockLockId: string;
    name: string;
    target: LockTarget;
    coverage?: LockCoverage;
    coverageFloor?: string;
    hasGateway?: boolean;
    roomIds?: string[];
  }) {
    const coverage =
      data.coverage ?? (data.target === LockTarget.ROOM ? LockCoverage.ROOM : LockCoverage.PROPERTY);
    try {
      return await this.prisma.lock.create({
        data: {
          propertyId: data.propertyId,
          ttlockLockId: data.ttlockLockId,
          name: data.name,
          target: data.target,
          coverage,
          coverageFloor: coverage === LockCoverage.FLOOR ? (data.coverageFloor ?? null) : null,
          hasGateway: data.hasGateway ?? false,
          roomLinks:
            usesRoomList(coverage) && data.roomIds?.length
              ? { create: data.roomIds.map((roomId) => ({ roomId })) }
              : undefined,
        },
      });
    } catch (e) {
      return asLockError(e);
    }
  }

  /** Изменить зону покрытия замка (весь объект / этаж / список номеров). */
  async setCoverage(
    lockId: string,
    data: { coverage: LockCoverage; coverageFloor?: string; roomIds?: string[] },
  ) {
    await this.prisma.$transaction(async (tx) => {
      await tx.lock.update({
        where: { id: lockId },
        data: {
          coverage: data.coverage,
          coverageFloor: data.coverage === LockCoverage.FLOOR ? (data.coverageFloor ?? null) : null,
        },
      });
      // Явные привязки к номерам нужны только для ROOM / ROOM_LIST.
      if (usesRoomList(data.coverage)) {
        if (data.roomIds) await this.replaceRoomLinks(tx, lockId, data.roomIds);
      } else {
        await tx.roomLock.deleteMany({ where: { lockId } });
      }
    });
    return { ok: true };
  }

  /** Полностью заменить список номеров замка (для ROOM / ROOM_LIST). */
  async setRoomLinks(lockId: string, roomIds: string[]) {
    await this.prisma.$transaction((tx) => this.replaceRoomLinks(tx, lockId, roomIds));
    return { ok: true };
  }

  /** Привязать замок к одному номеру (не трогая остальные привязки). */
  async linkRoom(lockId: string, roomId: string) {
    try {
      await this.prisma.roomLock.upsert({
        where: { roomId_lockId: { roomId, lockId } },
        create: { roomId, lockId },
        update: {},
      });
    } catch (e) {
      return asLockError(e);
    }
    return { ok: true };
  }

  async unlinkRoom(lockId: string, roomId: string) {
    await this.prisma.roomLock
      .delete({ where: { roomId_lockId: { roomId, lockId } } })
      .catch(() => undefined);
    return { ok: true };
  }

  private async replaceRoomLinks(tx: Prisma.TransactionClient, lockId: string, roomIds: string[]) {
    await tx.roomLock.deleteMany({ where: { lockId } });
    if (roomIds.length) {
      try {
        await tx.roomLock.createMany({
          data: roomIds.map((roomId) => ({ roomId, lockId })),
          skipDuplicates: true,
        });
      } catch (e) {
        asLockError(e);
      }
    }
  }
}

/** Зоны покрытия, которым нужен явный список номеров в RoomLock. */
function usesRoomList(coverage: LockCoverage): boolean {
  return coverage === LockCoverage.ROOM || coverage === LockCoverage.ROOM_LIST;
}
