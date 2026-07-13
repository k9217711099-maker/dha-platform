'use client';

import { useEffect, useState } from 'react';
import { Button, Card } from '@dha/ui';
import {
  adminApi, type OpsChecklistAnalytics, type OpsCleaningRow, type OpsDashboard, type OpsPmRule, type OpsProReport,
  type OpsRepeatRow, type OpsStaff, type OpsTasksReport, type OpsTimelineDay, type PmsRoomOption,
} from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';
import { DateRangePicker } from '../../../components/DateRangePicker';
import { HK_STATUS_RU, STATUS } from '../shared';

const selectCls = 'rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Отчёты (§9): дашборд, динамика задач, уборки план/факт. */
export default function OpsReportsPage() {
  const ready = useRequireAdmin();
  const [propertyId, setPropertyId] = useState('');
  const [options, setOptions] = useState<PmsRoomOption[]>([]);
  const [staff, setStaff] = useState<OpsStaff[]>([]);
  const [dash, setDash] = useState<OpsDashboard | null>(null);
  const [from, setFrom] = useState(iso(new Date(Date.now() - 6 * 86_400_000)));
  const [to, setTo] = useState(iso(new Date()));
  const [userId, setUserId] = useState('');
  const [tasksReport, setTasksReport] = useState<OpsTasksReport | null>(null);
  const [cleanings, setCleanings] = useState<OpsCleaningRow[]>([]);
  const [timeline, setTimeline] = useState<OpsTimelineDay[]>([]);
  const [clAnalytics, setClAnalytics] = useState<OpsChecklistAnalytics[]>([]);
  const [pro, setPro] = useState<OpsProReport | null>(null);
  const [repeats, setRepeats] = useState<OpsRepeatRow[]>([]);
  const [pmRules, setPmRules] = useState<OpsPmRule[]>([]);

  useEffect(() => {
    if (!ready) return;
    void adminApi.pmsRoomOptions().then(setOptions).catch(() => undefined);
    void adminApi.opsStaff().then(setStaff).catch(() => undefined);
    void adminApi.opsPmRules().then(setPmRules).catch(() => undefined);
  }, [ready]);
  useEffect(() => { if (ready) void adminApi.opsDashboard(propertyId || undefined).then(setDash).catch(() => undefined); }, [ready, propertyId]);
  useEffect(() => {
    if (!ready || !from || !to) return;
    void adminApi.opsReportTasks(from, to, propertyId || undefined).then(setTasksReport).catch(() => undefined);
    void adminApi.opsReportCleanings(from, to, propertyId || undefined, userId || undefined).then(setCleanings).catch(() => undefined);
    void adminApi.opsTimeline(from, to, propertyId || undefined).then(setTimeline).catch(() => undefined);
    void adminApi.opsChecklistAnalytics(from, to, propertyId || undefined).then(setClAnalytics).catch(() => undefined);
    void adminApi.opsProReport(from, to, propertyId || undefined).then(setPro).catch(() => undefined);
    void adminApi.opsRepeats(from, to, propertyId || undefined).then(setRepeats).catch(() => undefined);
  }, [ready, from, to, propertyId, userId]);

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  const taskCount = (status: string) => dash?.tasks.filter((t) => t.status === status).reduce((s, t) => s + t.count, 0) ?? 0;
  const maxDay = Math.max(1, ...(tasksReport?.days ?? []).map((d) => Math.max(d.created, d.done, d.cancelled)));

  return (
    <main className="px-8 py-8">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-light text-ink">Операции · Отчёты</h1>
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={selectCls}>
          <option value="">Все объекты</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <p className="mb-5 text-sm text-dark-gray">Статус «План» в отчёты не входит (§9).</p>

      {/* Дашборд (§9.1) */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Задачи сегодня</p>
          <div className="flex flex-wrap gap-1.5">
            {(['NEW', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED', 'DONE'] as const).map((s) => (
              <span key={s} className={`rounded-full px-2.5 py-1 text-xs ${STATUS[s].cls}`}>{STATUS[s].label}: {taskCount(s)}</span>
            ))}
          </div>
        </Card>
        <Card>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-400">Номера</p>
          <div className="flex flex-wrap gap-1.5">
            {(dash?.rooms ?? []).map((r) => {
              const s = HK_STATUS_RU[r.status];
              return <span key={r.status} className={`rounded-full px-2.5 py-1 text-xs ${s?.cls ?? 'bg-slate-100 text-slate-600'}`}>{s?.label ?? r.status}: {r.count}</span>;
            })}
          </div>
        </Card>
        <Card>
          <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">Просроченные</p>
          <p className={`text-3xl font-light ${dash && dash.overdue > 0 ? 'text-rose-600' : 'text-ink'}`}>{dash?.overdue ?? '—'}</p>
        </Card>
        <Card>
          <p className="mb-1 text-xs uppercase tracking-wide text-slate-400">В ремонте / DND</p>
          <p className="text-3xl font-light text-ink">{dash?.outOfOrder ?? '—'} <span className="text-lg text-slate-400">/ {dash?.dnd ?? '—'}</span></p>
        </Card>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); if (t) setTo(t); }} className="w-60" placeholder="Период отчёта" />
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className={selectCls}>
          <option value="">Все сотрудники</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name ?? s.email}</option>)}
        </select>
      </div>

      {/* Задачи за период (§9.2) */}
      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-ink">Задачи за период: создано / сделано / отменено</p>
          <p className="text-xs text-slate-400">
            Всего: {tasksReport?.total ?? 0}
            {tasksReport?.avgReactionSeconds != null ? ` · реакция ~${Math.round(tasksReport.avgReactionSeconds / 60)} мин` : ''}
            {tasksReport?.avgWorkSeconds != null ? ` · выполнение ~${Math.round(tasksReport.avgWorkSeconds / 60)} мин` : ''}
          </p>
        </div>
        <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ minHeight: 90 }}>
          {(tasksReport?.days ?? []).map((d) => (
            <div key={d.date} className="flex shrink-0 flex-col items-center gap-1" title={`${d.date}: +${d.created} / ✓${d.done} / ✕${d.cancelled}`}>
              <div className="flex items-end gap-0.5" style={{ height: 64 }}>
                <div className="w-2.5 rounded-t bg-indigo-300" style={{ height: `${(d.created / maxDay) * 100}%` }} />
                <div className="w-2.5 rounded-t bg-emerald-400" style={{ height: `${(d.done / maxDay) * 100}%` }} />
                <div className="w-2.5 rounded-t bg-rose-300" style={{ height: `${(d.cancelled / maxDay) * 100}%` }} />
              </div>
              <span className="text-[10px] text-slate-400">{d.date.slice(8)}.{d.date.slice(5, 7)}</span>
            </div>
          ))}
        </div>
        <p className="mt-1 text-[11px] text-slate-400"><span className="text-indigo-400">■</span> создано · <span className="text-emerald-500">■</span> сделано · <span className="text-rose-400">■</span> отменено</p>
      </Card>

      {/* Таймлайн (§9.4): скорость реакции и выполнения, сравнение с предыдущим днём */}
      <Card className="mb-6 overflow-x-auto">
        <p className="mb-3 text-sm font-medium text-ink">Таймлайн: реакция (Новая → в работе) и время выполнения, к предыдущему дню</p>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-3">День</th><th className="py-2 pr-3">Создано</th><th className="py-2 pr-3">Сделано</th>
              <th className="py-2 pr-3">Реакция</th><th className="py-2 pr-3">Выполнение</th>
            </tr>
          </thead>
          <tbody>
            {timeline.map((d, i) => {
              const prev = timeline[i - 1];
              const delta = (cur: number | null, pr: number | null | undefined) => {
                if (cur == null || pr == null || pr === 0) return null;
                const pct = Math.round(((cur - pr) / pr) * 100);
                // Меньше времени — лучше (зелёный).
                return <span className={`ml-1.5 text-[11px] ${pct <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{pct > 0 ? '+' : ''}{pct}%</span>;
              };
              const mins = (s: number | null) => (s == null ? '—' : `${Math.round(s / 60)} мин`);
              return (
                <tr key={d.date} className="border-t border-ink/5">
                  <td className="py-2 pr-3 text-slate-500">{d.date.slice(8)}.{d.date.slice(5, 7)}</td>
                  <td className="py-2 pr-3 text-ink">{d.created}</td>
                  <td className="py-2 pr-3 text-ink">{d.done}</td>
                  <td className="py-2 pr-3 text-ink">{mins(d.avgReactionSeconds)}{delta(d.avgReactionSeconds, prev?.avgReactionSeconds)}</td>
                  <td className="py-2 pr-3 text-ink">{mins(d.avgWorkSeconds)}{delta(d.avgWorkSeconds, prev?.avgWorkSeconds)}</td>
                </tr>
              );
            })}
            {timeline.length === 0 ? <tr><td colSpan={5} className="py-4 text-sm text-slate-400">Нет данных за период.</td></tr> : null}
          </tbody>
        </table>
      </Card>

      {/* Аналитика чек-листов (§5.4): средний % без ошибок, история прохождений */}
      <Card className="mb-6">
        <p className="mb-3 text-sm font-medium text-ink">Чек-листы: средний % без ошибок и история прохождений (по завершённым задачам)</p>
        {clAnalytics.length === 0 ? <p className="text-sm text-slate-400">Нет прохождений за период.</p> : (
          <div className="space-y-2">
            {clAnalytics.map((cl) => (
              <details key={cl.checklistId} className="rounded-lg border border-ink/10 px-3 py-2">
                <summary className="flex cursor-pointer flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium text-ink">{cl.name}</span>
                  <span className="text-xs text-slate-400">{cl.runs} прохождений</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs ${cl.avgScore >= 90 ? 'bg-emerald-100 text-emerald-700' : cl.avgScore >= 70 ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'}`}>{cl.avgScore}%</span>
                  {cl.totalErrors > 0 ? <span className="text-xs text-rose-600">{cl.totalErrors} ошибок</span> : null}
                  <span className="ml-auto flex items-end gap-0.5" title="Динамика последних прохождений">
                    {cl.history.slice(0, 14).reverse().map((h, i) => (
                      <span key={i} className={`w-1.5 rounded-t ${h.score >= 90 ? 'bg-emerald-400' : h.score >= 70 ? 'bg-amber-400' : 'bg-rose-400'}`} style={{ height: `${Math.max(4, h.score / 5)}px` }} />
                    ))}
                  </span>
                </summary>
                <div className="mt-2 space-y-1">
                  {cl.history.map((h, i) => (
                    <p key={i} className="text-xs text-slate-500">
                      {h.date.slice(8)}.{h.date.slice(5, 7)} · №{h.room} · {h.taskTitle} · {h.assignee} ·{' '}
                      <span className={h.score < 100 ? 'font-semibold text-rose-600' : 'text-emerald-600'}>{h.score}%</span>
                      {h.errors > 0 ? ` (ошибок: ${h.errors})` : ''}
                    </p>
                  ))}
                </div>
              </details>
            ))}
          </div>
        )}
      </Card>

      {/* Отчёты Pro (§9): почасовая загрузка + шаблонные задачи */}
      <Card className="mb-6">
        <p className="mb-3 text-sm font-medium text-ink">Pro: загрузка по часам суток и шаблонные/повторяющиеся задачи</p>
        <div className="flex items-end gap-1 overflow-x-auto pb-1" style={{ minHeight: 80 }}>
          {(pro?.hours ?? []).map((h) => {
            const max = Math.max(1, ...(pro?.hours ?? []).map((x) => x.total));
            return (
              <div key={h.hour} className="flex shrink-0 flex-col items-center gap-1" title={`${h.hour}:00 — всего ${h.total}, шаблонных ${h.templated}`}>
                <div className="relative flex w-4 items-end justify-center rounded-t bg-slate-100" style={{ height: 56 }}>
                  <div className="absolute bottom-0 w-full rounded-t bg-indigo-300" style={{ height: `${(h.total / max) * 100}%` }} />
                  <div className="absolute bottom-0 w-full rounded-t bg-violet-500/70" style={{ height: `${(h.templated / max) * 100}%` }} />
                </div>
                <span className="text-[9px] text-slate-400">{h.hour}</span>
              </div>
            );
          })}
        </div>
        <p className="mb-3 text-[11px] text-slate-400"><span className="text-indigo-400">■</span> все задачи · <span className="text-violet-500">■</span> из шаблонов/планировщика</p>
        {(pro?.templates ?? []).length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="py-1.5 pr-3">Шаблон / повтор</th><th className="py-1.5 pr-3">Создано</th>
                <th className="py-1.5 pr-3">Сделано</th><th className="py-1.5 pr-3">Ср. время</th><th className="py-1.5 pr-3">Номеров</th>
              </tr>
            </thead>
            <tbody>
              {(pro?.templates ?? []).map((t, i) => (
                <tr key={i} className="border-t border-ink/5">
                  <td className="py-1.5 pr-3 text-ink">{t.name} <span className="text-xs text-slate-400">({t.kind === 'template' ? 'шаблон' : 'планировщик'})</span></td>
                  <td className="py-1.5 pr-3 text-ink">{t.count}</td>
                  <td className="py-1.5 pr-3 text-ink">{t.done}</td>
                  <td className="py-1.5 pr-3 text-ink">{t.avgWorkSeconds != null ? `${Math.round(t.avgWorkSeconds / 60)} мин` : '—'}</td>
                  <td className="py-1.5 pr-3 text-ink">{t.rooms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-slate-400">Шаблонных задач за период нет.</p>}
      </Card>

      {/* Уборки план/факт (§9.3) */}
      <Card className="overflow-x-auto">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-ink">Уборки: факт vs норматив, ошибки чек-листов</p>
          <Button variant="secondary" onClick={() => void adminApi.opsExportCleanings(from, to, propertyId || undefined, userId || undefined)}>Excel</Button>
        </div>
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-3">Дата</th><th className="py-2 pr-3">Номер</th><th className="py-2 pr-3">Тип</th>
              <th className="py-2 pr-3">Исполнитель</th><th className="py-2 pr-3">Статус</th>
              <th className="py-2 pr-3">Норматив</th><th className="py-2 pr-3">Факт</th><th className="py-2 pr-3">Ошибки</th>
            </tr>
          </thead>
          <tbody>
            {cleanings.map((r) => (
              <tr key={r.id} className="border-t border-ink/5">
                <td className="py-2 pr-3 text-slate-500">{r.date.slice(8)}.{r.date.slice(5, 7)}</td>
                <td className="py-2 pr-3 font-medium text-ink">№{r.room}</td>
                <td className="py-2 pr-3 text-ink">{r.type}</td>
                <td className="py-2 pr-3 text-ink">{r.assignee}</td>
                <td className="py-2 pr-3"><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[r.status].cls}`}>{r.statusRu}</span></td>
                <td className="py-2 pr-3 text-slate-500">{r.standardMinutes != null ? `${r.standardMinutes} мин` : '—'}</td>
                <td className={`py-2 pr-3 ${r.exceeded ? 'font-semibold text-rose-600' : 'text-ink'}`}>{r.factMinutes != null ? `${r.factMinutes} мин` : '—'}</td>
                <td className={`py-2 pr-3 ${r.errors > 0 ? 'font-semibold text-rose-600' : 'text-slate-400'}`}>{r.errors}</td>
              </tr>
            ))}
            {cleanings.length === 0 ? <tr><td colSpan={8} className="py-4 text-sm text-slate-400">Уборок за период нет.</td></tr> : null}
          </tbody>
        </table>
      </Card>

      {/* ППР (LQA): ход профилактических циклов номерного фонда. */}
      {pmRules.length > 0 ? (
        <Card className="mt-6">
          <p className="mb-1 text-sm font-medium text-ink">ППР — профилактика номерного фонда</p>
          <p className="mb-3 text-xs text-slate-500">Прогресс текущего цикла по каждому правилу. Задачи создаются автоматически каждую ночь; «ждут» — номера, которым профилактика уже нужна.</p>
          <div className="space-y-2.5">
            {pmRules.map((r) => {
              const pct = r.stats.totalRooms > 0 ? Math.round((r.stats.doneInCycle / r.stats.totalRooms) * 100) : 0;
              return (
                <div key={r.id} className="rounded-lg border border-ink/10 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-ink">{r.name}</span>
                    {!r.enabled ? <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">выключен</span> : null}
                    <span className="text-xs text-slate-400">раз в {r.periodDays} дн. · по {r.perDay}/день{r.lastRunAt ? ` · генерация: ${new Date(r.lastRunAt).toLocaleDateString('ru-RU')}` : ''}</span>
                    <span className="ml-auto text-xs text-slate-500">{r.stats.doneInCycle}/{r.stats.totalRooms} ({pct}%)</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-400' : 'bg-indigo-400'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                  <p className="mt-1 flex flex-wrap gap-3 text-xs">
                    <span className={r.stats.dueRooms > 0 ? 'font-medium text-amber-700' : 'text-emerald-600'}>
                      {r.stats.dueRooms > 0 ? `ждут профилактику: ${r.stats.dueRooms}` : 'очередь пуста ✓'}
                    </span>
                    {r.stats.neverDone > 0 ? <span className="text-rose-600">ни разу не проходили: {r.stats.neverDone}</span> : null}
                    <span className="text-slate-400">в работе сейчас: {r.stats.open}</span>
                    {r.stats.dueRooms > 0 && r.stats.daysToClear != null ? <span className="text-slate-400">текущим темпом очередь закроется за ~{r.stats.daysToClear} дн.</span> : null}
                  </p>
                </div>
              );
            })}
          </div>
        </Card>
      ) : null}

      {/* Повторные заявки (LQA): тот же номер + тот же тег ≥2 раз за период — маркер некачественного ремонта. */}
      <Card className="mt-6">
        <p className="mb-1 text-sm font-medium text-ink">Повторные заявки</p>
        <p className="mb-3 text-xs text-slate-500">Один номер, одна тема (тег) — две и более заявки за период. Повод проверить качество ремонта или заменить узел.</p>
        {repeats.length === 0 ? <p className="py-2 text-sm text-slate-400">Повторов за период нет — хороший знак.</p> : (
          <div className="space-y-2">
            {repeats.map((r) => (
              <div key={`${r.roomId}|${r.label}`} className="rounded-lg border border-rose-200 bg-rose-50/40 px-3 py-2 text-sm">
                <p className="flex items-center gap-2">
                  <span className="font-medium text-ink">№{r.room}</span>
                  <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">{r.label} × {r.count}</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {r.items.map((i) => `${new Date(i.createdAt).toLocaleDateString('ru-RU')} — ${i.title} (${STATUS[i.status].label})`).join(' · ')}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}
