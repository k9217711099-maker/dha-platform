import { describe, it, expect } from 'vitest';
import { computeQaMetrics, type QaTimelineMsg } from './qa-metrics.js';

const base = new Date('2026-07-09T10:00:00Z').getTime();
const at = (sec: number) => new Date(base + sec * 1000);

describe('computeQaMetrics', () => {
  it('операторская фаза: считает pickup/first-response/avg/max/resolution + SLA', () => {
    const messages: QaTimelineMsg[] = [
      { role: 'USER', createdAt: at(0) },
      { role: 'ASSISTANT', createdAt: at(5) }, // автоответ бота — не участвует в латентности
      { role: 'USER', createdAt: at(60) },
      { role: 'STAFF', createdAt: at(180) }, // первый ответ оператора
      { role: 'USER', createdAt: at(240) },
      { role: 'STAFF', createdAt: at(270) },
    ];
    const m = computeQaMetrics(
      { escalatedAt: at(70), assignedAt: at(150), closedAt: at(600), messages },
      300,
    );
    expect(m.timeToPickupSec).toBe(80); // 150 − 70
    expect(m.firstResponseSec).toBe(110); // 180 − 70
    expect(m.resolutionSec).toBe(530); // 600 − 70
    expect(m.avgResponseSec).toBe(105); // латентности [180, 30] → 105
    expect(m.maxResponseSec).toBe(180);
    expect(m.guestMsgCount).toBe(3);
    expect(m.staffMsgCount).toBe(2);
    expect(m.withinSla).toBe(true); // 110 ≤ 300
  });

  it('нарушение SLA: первый ответ дольше порога', () => {
    const messages: QaTimelineMsg[] = [
      { role: 'USER', createdAt: at(0) },
      { role: 'STAFF', createdAt: at(500) },
    ];
    const m = computeQaMetrics(
      { escalatedAt: at(0), assignedAt: at(490), closedAt: null, messages },
      300,
    );
    expect(m.firstResponseSec).toBe(500);
    expect(m.withinSla).toBe(false);
    expect(m.resolutionSec).toBeNull(); // диалог не закрыт
  });

  it('без операторской фазы (только бот): временные метрики null, SLA null', () => {
    const messages: QaTimelineMsg[] = [
      { role: 'USER', createdAt: at(0) },
      { role: 'ASSISTANT', createdAt: at(3) },
    ];
    const m = computeQaMetrics(
      { escalatedAt: null, assignedAt: null, closedAt: null, messages },
      300,
    );
    expect(m.timeToPickupSec).toBeNull();
    expect(m.firstResponseSec).toBeNull();
    expect(m.avgResponseSec).toBeNull();
    expect(m.resolutionSec).toBeNull();
    expect(m.withinSla).toBeNull();
    expect(m.guestMsgCount).toBe(1);
    expect(m.staffMsgCount).toBe(0);
  });
});
