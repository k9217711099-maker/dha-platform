import type { OpsBlockerKind, OpsStatus } from '../../lib/api';

/** Блокеры отложенной задачи (workflow-ТЗ §2.1): подпись + значок для UI. */
export const BLOCKER: Record<OpsBlockerKind, { label: string; icon: string }> = {
  PARTS:      { label: 'Ждём запчасть / материал', icon: '⏳' },
  CONTRACTOR: { label: 'Ждём подрядчика',          icon: '👷' },
  APPROVAL:   { label: 'Ждём согласования',        icon: '✅' },
  SCHEDULED:  { label: 'Отложено на дату',         icon: '🕐' },
};

/** Статусы задач (§3.2) — подписи, цвета бейджей (яркие, как в TeamJet), dot-цвет и hex для контура/заливки кнопок. */
export const STATUS: Record<OpsStatus, { label: string; cls: string; dot: string }> = {
  PLAN:            { label: 'План',            cls: 'bg-slate-200 text-slate-700',  dot: '#94a3b8' },
  NEW:             { label: 'Новая',           cls: 'bg-red-500 text-white',        dot: '#ef4444' },
  ACCEPTED:        { label: 'Принята',         cls: 'bg-sky-200 text-sky-900',      dot: '#0ea5e9' },
  IN_PROGRESS:     { label: 'В работе',        cls: 'bg-amber-400 text-white',      dot: '#f59e0b' },
  PAUSED:          { label: 'Отложена',        cls: 'bg-slate-300 text-slate-700',  dot: '#64748b' },
  WAITING_CONFIRM: { label: 'Ждёт подтв.',     cls: 'bg-violet-500 text-white',     dot: '#8b5cf6' },
  DONE:            { label: 'Сделана',         cls: 'bg-emerald-500 text-white',    dot: '#10b981' },
  CANCELLED:       { label: 'Отменена',        cls: 'bg-slate-200 text-slate-500',  dot: '#94a3b8' },
};

/** Допустимые переходы (зеркало серверной машины). Reopen — только с ops_manage. */
export const TRANSITIONS: Record<OpsStatus, OpsStatus[]> = {
  PLAN: ['NEW', 'CANCELLED'],
  NEW: ['ACCEPTED', 'IN_PROGRESS', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['PAUSED', 'WAITING_CONFIRM', 'DONE', 'CANCELLED'],
  PAUSED: ['IN_PROGRESS', 'WAITING_CONFIRM', 'DONE', 'CANCELLED'],
  WAITING_CONFIRM: ['DONE', 'IN_PROGRESS', 'CANCELLED'],
  DONE: ['NEW'],
  CANCELLED: ['NEW'],
};

export const ACTION_LABEL: Record<OpsStatus, string> = {
  PLAN: 'В план',
  NEW: 'Переоткрыть',
  ACCEPTED: 'Принять',
  IN_PROGRESS: 'В работу',
  PAUSED: 'Отложить',
  WAITING_CONFIRM: 'На подтверждение',
  DONE: 'Завершить',
  CANCELLED: 'Отменить',
};

/** Порядок этапов жизненного цикла для «степпера» статусов в карточке (§4.3). */
export const STATUS_PIPELINE: OpsStatus[] = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_CONFIRM', 'DONE'];

export const SEVERITY_RU: Record<string, string> = { MINOR: 'Обычная', MAJOR: 'Серьёзная', CRITICAL: 'Критичная' };

export const CONDITION_RU: Record<string, string> = {
  TODAY_CHECKOUT: 'Сегодня выезд',
  TODAY_CHECKIN: 'Сегодня заезд',
  BACK_TO_BACK: 'Выезд под заезд',
  VACANT: 'Свободен',
  OCCUPIED: 'Заселён',
};

export const HK_STATUS_RU: Record<string, { label: string; cls: string }> = {
  CLEAN: { label: 'Чистый', cls: 'bg-emerald-100 text-emerald-800' },
  DIRTY: { label: 'Грязный', cls: 'bg-rose-100 text-rose-700' },
  IN_PROGRESS: { label: 'На уборке', cls: 'bg-sky-100 text-sky-800' },
  INSPECTED: { label: 'Инспектирован', cls: 'bg-teal-100 text-teal-800' },
};

/** Цветовая метка крайнего срока (§4.2): просрочено / горит / скоро / в срок. null — срока нет или задача закрыта. */
export function dueTier(dueAt: string | null | undefined, status: OpsStatus): { cls: string; dot: string; label: string } | null {
  if (!dueAt || status === 'DONE' || status === 'CANCELLED') return null;
  const ms = new Date(dueAt).getTime() - Date.now();
  if (ms < 0) return { cls: 'bg-rose-100 text-rose-700', dot: '#ef4444', label: 'просрочено' };
  const h = ms / 3_600_000;
  if (h <= 4) return { cls: 'bg-orange-100 text-orange-700', dot: '#f97316', label: 'горит' };
  if (h <= 24) return { cls: 'bg-amber-100 text-amber-700', dot: '#f59e0b', label: 'сегодня' };
  return { cls: 'bg-emerald-100 text-emerald-700', dot: '#10b981', label: 'в срок' };
}

/** Цвет даты в колонке «Активность» (§4.2): по срочности крайнего срока, иначе — по свежести активности.
 *  Просрочено — ярко-красный жирный; горит/сегодня — оранжевый/янтарный; в срок — зелёный;
 *  без срока — по давности последней активности (свежая ярче, «затихшая» тусклее. */
export function activityColor(
  dueAt: string | null | undefined,
  status: OpsStatus,
  lastActivityAt: string | null | undefined,
): { cls: string; bold: boolean } {
  const dt = dueTier(dueAt, status);
  if (dt) {
    if (dt.label === 'просрочено') return { cls: 'text-rose-600', bold: true };
    if (dt.label === 'горит') return { cls: 'text-orange-600', bold: true };
    if (dt.label === 'сегодня') return { cls: 'text-amber-600', bold: false };
    return { cls: 'text-emerald-600', bold: false };
  }
  const age = lastActivityAt ? Date.now() - new Date(lastActivityAt).getTime() : Infinity;
  if (age < 3_600_000) return { cls: 'text-slate-700', bold: false }; // в течение часа — «живая»
  if (age < 86_400_000) return { cls: 'text-slate-500', bold: false }; // сегодня
  if (age < 3 * 86_400_000) return { cls: 'text-slate-400', bold: false }; // до 3 дней
  return { cls: 'text-slate-300', bold: false }; // затихла
}

export const fmtDT = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
export const fmtMin = (sec: number) => (sec >= 60 ? `${Math.round(sec / 60)} мин` : `${sec} c`);

/** Прогресс чек-листа в % (подпункты и excludeFromScore не считаются — §5.3). */
export function checklistProgress(items: { kind: string; excludeFromScore: boolean; id: string }[], answers: { itemId: string }[]): number {
  const scored = items.filter((i) => i.kind === 'ITEM' && !i.excludeFromScore);
  if (scored.length === 0) return 100;
  const done = new Set(answers.map((a) => a.itemId));
  return Math.round((scored.filter((i) => done.has(i.id)).length / scored.length) * 100);
}
