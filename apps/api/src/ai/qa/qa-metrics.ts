/**
 * Детерминированные QA-метрики диалога (§5.7) — чистая функция, без Nest/Prisma,
 * чтобы её можно было юнит-тестировать на фикстурах. Роли — строки формата
 * AiMessageRole ('USER' | 'ASSISTANT' | 'STAFF' | 'TOOL' | 'SYSTEM').
 */

export interface QaTimelineMsg {
  role: string;
  createdAt: Date;
}

export interface QaMetricsInput {
  /** Момент передачи диалога человеку (status → ESCALATED). */
  escalatedAt: Date | null;
  /** Момент, когда первый оператор взял диалог. */
  assignedAt: Date | null;
  /** Момент закрытия диалога. */
  closedAt: Date | null;
  messages: QaTimelineMsg[];
}

export interface QaMetrics {
  /** От эскалации до принятия диалога оператором. */
  timeToPickupSec: number | null;
  /** От эскалации до первого ответа оператора. */
  firstResponseSec: number | null;
  /** Среднее время ответа оператора на сообщение гостя. */
  avgResponseSec: number | null;
  /** Худшее (максимальное) время ответа оператора. */
  maxResponseSec: number | null;
  /** От эскалации до закрытия диалога. */
  resolutionSec: number | null;
  guestMsgCount: number;
  staffMsgCount: number;
  /** Уложился ли первый ответ в SLA (null — операторской фазы не было). */
  withinSla: boolean | null;
}

const diffSec = (a: Date, b: Date): number => Math.max(0, Math.round((a.getTime() - b.getTime()) / 1000));

/** Считает метрики из вех и таймлайна сообщений. slaSec — порог первого ответа. */
export function computeQaMetrics(input: QaMetricsInput, slaSec: number): QaMetrics {
  const { escalatedAt, assignedAt, closedAt } = input;
  const messages = [...input.messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const guestMsgCount = messages.filter((m) => m.role === 'USER').length;
  const staffMsgCount = messages.filter((m) => m.role === 'STAFF').length;
  const firstStaffAt = messages.find((m) => m.role === 'STAFF')?.createdAt ?? null;

  const firstResponseSec = escalatedAt && firstStaffAt ? diffSec(firstStaffAt, escalatedAt) : null;
  const timeToPickupSec =
    escalatedAt && assignedAt ? diffSec(assignedAt, escalatedAt) : firstResponseSec;
  const resolutionSec = escalatedAt && closedAt ? diffSec(closedAt, escalatedAt) : null;

  // Латентности ответа: от первого неотвеченного сообщения гостя до ответа оператора.
  const latencies: number[] = [];
  let pendingGuestAt: Date | null = null;
  for (const m of messages) {
    if (m.role === 'USER') {
      if (!pendingGuestAt) pendingGuestAt = m.createdAt;
    } else if (m.role === 'STAFF' && pendingGuestAt) {
      latencies.push(diffSec(m.createdAt, pendingGuestAt));
      pendingGuestAt = null;
    }
  }
  const avgResponseSec = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;
  const maxResponseSec = latencies.length ? Math.max(...latencies) : null;
  const withinSla = firstResponseSec === null ? null : firstResponseSec <= slaSec;

  return {
    timeToPickupSec,
    firstResponseSec,
    avgResponseSec,
    maxResponseSec,
    resolutionSec,
    guestMsgCount,
    staffMsgCount,
    withinSla,
  };
}
