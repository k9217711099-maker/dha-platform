'use client';

import { useEffect, useState } from 'react';
import { Card } from '@dha/ui';
import { adminApi, opsStreamUrl, type OpsKind, type OpsStaff, type OpsTask, type OpsTasksMode } from '../../../lib/api';
import { useAdminMe, useRequireAdmin } from '../../../lib/use-admin';
import { ACTION_LABEL, BLOCKER, STATUS, TRANSITIONS, checklistProgress, fmtDT } from '../shared';
import { TaskCard } from '../TaskCard';
import { PushToggle } from '../PushToggle';

/** «Мои задачи» (§11) — mobile-first экран исполнителя: смена, табы, крупные кнопки статусов. */
export default function MyTasksPage() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  const [kind, setKind] = useState<'' | OpsKind>('');
  const [showDone, setShowDone] = useState(false);
  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [claimable, setClaimable] = useState<OpsTask[]>([]);
  const [staff, setStaff] = useState<OpsStaff[]>([]);
  const [mode, setMode] = useState<OpsTasksMode>('simple');
  const [showPaused, setShowPaused] = useState(false);
  // ?task=<id> — открыть карточку сразу (переход из push-уведомления).
  const [openTask, setOpenTask] = useState<string | null>(() => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('task')));
  const [error, setError] = useState('');

  const myDuty = staff.find((s) => s.id === me?.id)?.onDuty ?? false;

  const load = () => {
    if (!me) return;
    void adminApi.opsTasks({ assigneeId: me.id, kind: kind || undefined }).then((all) =>
      setTasks(all.filter((t) => showDone || !['DONE', 'CANCELLED', 'PLAN'].includes(t.status))),
    ).catch(() => undefined);
    // Свободные задачи моего отдела — можно «взять» (§7-E).
    void adminApi.opsClaimable().then((all) => setClaimable(kind ? all.filter((t) => t.kind === kind) : all)).catch(() => undefined);
    void adminApi.opsStaff().then(setStaff).catch(() => undefined);
  };
  useEffect(() => { if (ready && me) void load(); }, [ready, me, kind, showDone]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void adminApi.opsTasksMode().then((r) => setMode(r.mode)).catch(() => undefined); }, []);

  useEffect(() => {
    if (!ready) return;
    const url = opsStreamUrl();
    if (!url) return;
    const es = new EventSource(url);
    es.onmessage = (e) => { try { if (JSON.parse(e.data as string).kind !== 'ping') void load(); } catch { /* ignore */ } };
    return () => es.close();
  }, [ready, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (fn: () => Promise<unknown>) => { setError(''); void fn().then(load).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка')); };

  if (!ready || !me) return <main className="px-4 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="mx-auto max-w-xl px-4 py-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h1 className="text-2xl font-light text-ink">Мои задачи</h1>
        <div className="flex items-center gap-1.5">
          {/* Push-уведомления (Web Push): приходят и при закрытой вкладке. */}
          <PushToggle />
          {/* Режим «в смене» (§10): не в смене — задания не приходят. */}
          <button
            type="button"
            onClick={() => run(() => adminApi.opsDuty(!myDuty))}
            className={`rounded-full px-4 py-2 text-sm font-medium transition ${myDuty ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}
          >{myDuty ? '● В смене' : '○ Не в смене'}</button>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div className="flex flex-1 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
          {([['', 'Все'], ['TASK', 'Задачи'], ['CLEANING', 'Уборки']] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setKind(v as '' | OpsKind)} className={`flex-1 rounded-md px-2 py-1.5 transition ${kind === v ? 'bg-white font-medium text-ink shadow-sm' : 'text-slate-500'}`}>{l}</button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-dark-gray"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />архив</label>
      </div>
      {error ? <p className="mb-2 text-sm text-rose-600">{error}</p> : null}

      {/* Свободные задачи моего отдела — самозабор (§7-E) */}
      {claimable.length > 0 ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-amber-800">🙋 Свободные в отделе <span className="rounded-full bg-amber-200 px-1.5 text-xs text-amber-800">{claimable.length}</span></p>
          <div className="space-y-1.5">
            {claimable.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 shadow-sm">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpenTask(t.id)}>
                  <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    {t.important ? <span className="text-amber-500">🔥</span> : null}
                    {t.kind === 'CLEANING' ? <span className="text-xs text-sky-600">🧹</span> : null}
                    {t.room ? <span>№{t.room.number}</span> : null}
                    <span className="truncate">{t.title}</span>
                  </p>
                  <p className="mt-0.5 text-[11px] text-dark-gray">{t.group ? `Отдел: ${t.group.name}` : ''}{t.dueAt ? ` · срок ${fmtDT(t.dueAt)}` : ''}</p>
                </button>
                <button type="button" onClick={() => run(() => adminApi.opsClaim(t.id))} className="shrink-0 rounded-full bg-amber-500 px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90">Взять</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {(() => {
        // Продвинутый режим (workflow-ТЗ §7.1): «Мой день» без отложенных, отложенные — отдельной сворачиваемой секцией.
        const advanced = mode === 'advanced';
        const active = advanced ? tasks.filter((t) => t.status !== 'PAUSED') : tasks;
        const paused = advanced ? tasks.filter((t) => t.status === 'PAUSED') : [];
        const renderTask = (t: OpsTask) => {
          const st = STATUS[t.status];
          const cl = t.checklists[0];
          let next = TRANSITIONS[t.status].filter((x) => x !== 'CANCELLED' && !(x === 'NEW' && (t.status === 'DONE' || t.status === 'CANCELLED')));
          // requireConfirmation: из работы отдаём «На подтверждение», а не «Завершить».
          if (t.requireConfirmation && (t.status === 'IN_PROGRESS' || t.status === 'PAUSED')) next = next.filter((x) => x !== 'DONE');
          if (!t.requireConfirmation && (t.status === 'IN_PROGRESS' || t.status === 'PAUSED')) next = next.filter((x) => x !== 'WAITING_CONFIRM');
          const overdue = t.dueAt && new Date(t.dueAt) < new Date() && !['DONE', 'CANCELLED'].includes(t.status);
          return (
            <Card key={t.id} className="!p-4">
              <button type="button" className="block w-full text-left" onClick={() => setOpenTask(t.id)}>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex min-w-0 items-center gap-1.5 font-medium text-ink">
                    {t.important ? <span className="text-amber-500">▲</span> : null}
                    {t.room ? <span>№{t.room.number}</span> : null}
                    <span className="truncate">{t.title}</span>
                  </p>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs ${st.cls}`}>{st.label}</span>
                </div>
                <p className="mt-1 text-xs text-dark-gray">
                  {t.kind === 'CLEANING' ? 'Уборка' : 'Задача'} · {fmtDT(t.createdAt)}
                  {t.dueAt ? <span className={overdue ? 'font-semibold text-rose-600' : ''}> · срок {fmtDT(t.dueAt)}</span> : null}
                  {typeof t.standardMinutes === 'number' ? ` · норматив ${t.standardMinutes} мин` : ''}
                </p>
                {/* Блокер отложенной задачи — чтобы было видно, чего ждём (workflow-ТЗ §2.1) */}
                {t.status === 'PAUSED' && t.blockerKind ? (
                  <p className="mt-1 text-xs text-slate-500">{BLOCKER[t.blockerKind].icon} {BLOCKER[t.blockerKind].label}{t.blockerUntil ? ` · до ${fmtDT(t.blockerUntil)}` : ''}</p>
                ) : null}
                {cl ? (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${checklistProgress(cl.itemsSnapshot, cl.answers)}%` }} /></div>
                    <span className="text-[11px] text-slate-400">{checklistProgress(cl.itemsSnapshot, cl.answers)}%</span>
                  </div>
                ) : null}
              </button>
              {next.length ? (
                <div className="mt-3 flex gap-2">
                  {next.map((to) => (
                    // «Отложить» ведёт в карточку — там выбирают причину блокера (иначе бэкенд отклонит).
                    <button key={to} type="button" onClick={() => (to === 'PAUSED' ? setOpenTask(t.id) : run(() => adminApi.opsStatus(t.id, to)))} className="flex-1 rounded-full px-3 py-2 text-sm font-medium text-white transition hover:opacity-90" style={{ backgroundColor: STATUS[to].dot }}>{ACTION_LABEL[to]}</button>
                  ))}
                </div>
              ) : null}
            </Card>
          );
        };
        return (
          <>
            {advanced ? <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Мой день</h2> : null}
            <div className="space-y-2.5">
              {active.length === 0 ? <p className="py-8 text-center text-sm text-dark-gray">Задач нет. {myDuty ? 'Хорошая смена!' : 'Включите смену, чтобы получать задания.'}</p> : null}
              {active.map(renderTask)}
            </div>
            {paused.length > 0 ? (
              <div className="mt-4">
                <button type="button" onClick={() => setShowPaused((v) => !v)} className="mb-2 flex w-full items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <span>{showPaused ? '▾' : '▸'}</span> Отложенные <span className="rounded-full bg-slate-200 px-1.5 text-xs normal-case text-slate-600">{paused.length}</span>
                </button>
                {showPaused ? <div className="space-y-2.5">{paused.map(renderTask)}</div> : null}
              </div>
            ) : null}
          </>
        );
      })()}

      {openTask ? <TaskCard taskId={openTask} staff={staff} onClose={() => setOpenTask(null)} onChanged={load} /> : null}
    </main>
  );
}
