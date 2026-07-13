import { LockCoverage } from '@prisma/client';

/** Номер (юнит) для расчёта покрытия замками. */
export interface CoverageRoom {
  id: string;
  propertyId: string;
  floor: string | null;
}

/** Замок с зоной покрытия и списком явно привязанных номеров. */
export interface CoverageLock {
  propertyId: string;
  coverage: LockCoverage;
  coverageFloor: string | null;
  /** ID номеров из RoomLock (для ROOM / ROOM_LIST). */
  roomIds: string[];
}

/**
 * Открывает ли замок дверь конкретного номера. Общие двери покрывают номер по
 * зоне (весь объект / этаж), личные и списочные — по явной привязке (§9.1).
 */
export function lockCoversRoom(lock: CoverageLock, room: CoverageRoom): boolean {
  if (lock.propertyId !== room.propertyId) return false;
  switch (lock.coverage) {
    case LockCoverage.PROPERTY:
      return true;
    case LockCoverage.FLOOR:
      return lock.coverageFloor != null && lock.coverageFloor === room.floor;
    case LockCoverage.ROOM:
    case LockCoverage.ROOM_LIST:
      return lock.roomIds.includes(room.id);
    default:
      return false;
  }
}
