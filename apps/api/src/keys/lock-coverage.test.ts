import { describe, expect, it } from 'vitest';
import { LockCoverage } from '@prisma/client';
import { lockCoversRoom, type CoverageLock, type CoverageRoom } from './lock-coverage.js';

const room: CoverageRoom = { id: 'r-101', propertyId: 'p1', floor: '3' };

function lock(partial: Partial<CoverageLock>): CoverageLock {
  return {
    propertyId: 'p1',
    coverage: LockCoverage.PROPERTY,
    coverageFloor: null,
    roomIds: [],
    ...partial,
  };
}

describe('lockCoversRoom', () => {
  it('не покрывает номер чужого объекта', () => {
    expect(lockCoversRoom(lock({ propertyId: 'p2', coverage: LockCoverage.PROPERTY }), room)).toBe(false);
  });

  it('PROPERTY покрывает любой номер объекта', () => {
    expect(lockCoversRoom(lock({ coverage: LockCoverage.PROPERTY }), room)).toBe(true);
  });

  it('FLOOR покрывает только совпадающий этаж', () => {
    expect(lockCoversRoom(lock({ coverage: LockCoverage.FLOOR, coverageFloor: '3' }), room)).toBe(true);
    expect(lockCoversRoom(lock({ coverage: LockCoverage.FLOOR, coverageFloor: '4' }), room)).toBe(false);
  });

  it('FLOOR без указанного этажа не покрывает', () => {
    expect(lockCoversRoom(lock({ coverage: LockCoverage.FLOOR, coverageFloor: null }), room)).toBe(false);
  });

  it('ROOM/ROOM_LIST покрывают только по явной привязке', () => {
    expect(lockCoversRoom(lock({ coverage: LockCoverage.ROOM, roomIds: ['r-101'] }), room)).toBe(true);
    expect(lockCoversRoom(lock({ coverage: LockCoverage.ROOM, roomIds: ['r-102'] }), room)).toBe(false);
    expect(lockCoversRoom(lock({ coverage: LockCoverage.ROOM_LIST, roomIds: ['r-102', 'r-101'] }), room)).toBe(true);
  });
});
