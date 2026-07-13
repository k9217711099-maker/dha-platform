'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card } from '@dha/ui';
import { adminApi, type OpsPlan, type OpsSection, type OpsTask, type PmsRoomOption } from '../../../../lib/api';
import { useRequireAdmin } from '../../../../lib/use-admin';
import { STATUS } from '../../shared';
import { TaskCard } from '../../TaskCard';

const selectCls = 'rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';
const today = () => new Date().toISOString().slice(0, 10);

/** План уборок (§6.3): распределение drag&drop, автораспределение, отправка заданий. */
export default function CleaningPlanPage() {
  const ready = useRequireAdmin();
  const [date, setDate] = useState(today());
  const [propertyId, setPropertyId] = useState('');
  const [options, setOptions] = useState<PmsRoomOption[]>([]);
  const [plan, setPlan] = useState<OpsPlan | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  // Группировка нераспределённых (§6.3): по корпусам/этажам или секциям.
  const [group, setGroup] = useState<'none' | 'floor' | 'section'>('none');
  const [sections, setSections] = useState<OpsSection[]>([]);

  const load = () => adminApi.opsPlan(date, propertyId || undefined).then((p) => {
    setPlan(p);
    setSelectedUsers((prev) => prev.length ? prev : p.users.map((u) => u.id));
  }).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));

  useEffect(() => {
    if (!ready) return;
    void adminApi.pmsRoomOptions().then((o) => { setOptions(o); if (o[0]) setPropertyId(o[0].id); });
    void adminApi.opsSections().then(setSections).catch(() => undefined);
  }, [ready]);
  useEffect(() => { if (ready && propertyId) void load(); }, [ready, date, propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (fn: () => Promise<unknown>, okMsg?: string) => {
    setError(''); setMsg('');
    void fn().then((r) => { if (okMsg) setMsg(okMsg + (r && typeof r === 'object' && 'sent' in r ? `: ${(r as { sent: number }).sent}` : r && typeof r === 'object' && 'created' in r ? `: ${(r as { created: number }).created}` : '')); void load(); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  };

  const typeById = useMemo(() => new Map((plan?.types ?? []).map((t) => [t.id, t])), [plan?.types]);
  const unassigned = (plan?.tasks ?? []).filter((t) => t.assignees.length === 0);
  const byUser = (userId: string) => (plan?.tasks ?? []).filter((t) => t.assignees.some((a) => a.userId === userId));

  /** Печать заданий (§6.3): все горничные или одна. Открывает окно печати с листами по сотрудникам. */
  const printPlan = (onlyUserId?: string) => {
    if (!plan) return;
    const users = plan.users.filter((u) => (onlyUserId ? u.id === onlyUserId : byUser(u.id).length > 0));
    const propertyName = options.find((o) => o.id === propertyId)?.name ?? '';
    const esc = (x: string) => x.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const sheets = users.map((u) => {
      const list = byUser(u.id);
      const rows = list.map((t, i) => {
        const type = t.cleaningTypeId ? typeById.get(t.cleaningTypeId) : null;
        const marks = [t.room?.cleanRequestedAt ? 'просит уборку' : '', t.room?.dndUntil && new Date(t.room.dndUntil) > new Date() ? 'DND' : ''].filter(Boolean).join(', ');
        return `<tr><td>${i + 1}</td><td><b>№${esc(t.room?.number ?? '—')}</b></td><td>${esc(type?.name ?? t.title)}</td><td>${t.standardMinutes ?? 30} мин</td><td>${esc(marks)}</td><td class="box"></td></tr>`;
      }).join('');
      const total = list.reduce((sum, t) => sum + (t.standardMinutes ?? 30), 0);
      return `<section><h2>${esc(u.name ?? u.email)} <small>${esc(propertyName)} · ${plan.date} · ${list.length} уборок · ~${total} мин</small></h2>
        <table><thead><tr><th>#</th><th>Номер</th><th>Тип уборки</th><th>Норматив</th><th>Отметки</th><th>Готово</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    }).join('');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>План уборок ${plan.date}</title><style>
      body{font-family:system-ui,sans-serif;margin:24px;color:#111}
      h2{font-size:16px;margin:0 0 8px}h2 small{font-weight:400;color:#666;font-size:12px}
      table{width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px}
      th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
      th{background:#f5f5f5;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
      td.box{width:56px}section{page-break-after:always}section:last-child{page-break-after:auto}
    </style></head><body>${sheets || '<p>Нет назначенных уборок.</p>'}</body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const taskChip = (t: OpsTask & { standardMinutes?: number }, draggable: boolean) => {
    const type = t.cleaningTypeId ? typeById.get(t.cleaningTypeId) : null;
    const dnd = t.room?.dndUntil && new Date(t.room.dndUntil) > new Date();
    return (
      <div
        key={t.id}
        draggable={draggable}
        onDragStart={() => setDrag(t.id)}
        onClick={() => setOpenTask(t.id)}
        className="flex cursor-pointer items-center justify-between gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm shadow-sm transition hover:shadow"
      >
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-ink">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: type?.color ?? '#94a3b8' }} />
            <span className="font-medium">№{t.room?.number ?? '—'}</span>
            <span className="truncate text-slate-500">{type?.name ?? t.title}</span>
          </p>
          <p className="text-[11px] text-slate-400">
            {t.standardMinutes ?? 30} мин
            {t.room?.cleanRequestedAt ? ' · просит уборку' : ''}
            {dnd ? ' · DND' : ''}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS[t.status].cls}`}>{STATUS[t.status].label}</span>
      </div>
    );
  };

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-light text-ink">Операции · План уборок</h1>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => run(() => adminApi.opsPlanGenerate(date, propertyId || undefined), 'Создано по правилам')}>Сгенерировать по правилам</Button>
          <Button variant="secondary" onClick={() => run(() => adminApi.opsPlanAuto(date, propertyId, selectedUsers), 'Распределено')} disabled={selectedUsers.length === 0}>Автораспределение</Button>
          <Button variant="secondary" onClick={() => printPlan()}>Печать</Button>
          <Button onClick={() => run(() => adminApi.opsPlanSend(date, propertyId || undefined), 'Отправлено заданий')}>Отправить задания</Button>
          <Button variant="secondary" onClick={() => { if (confirm('Отменить все незавершённые уборки дня?')) run(() => adminApi.opsPlanCancel(date, propertyId || undefined), 'Отменено'); }}>Отменить</Button>
        </div>
      </div>
      <p className="mb-5 text-sm text-dark-gray">Перетащите номера на горничных; «Отправить задания» переводит план в работу (NEW) и уведомляет исполнителей.</p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={selectCls} />
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={selectCls}>
          {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select value={group} onChange={(e) => setGroup(e.target.value as typeof group)} className={selectCls}>
          <option value="none">Без группировки</option>
          <option value="floor">По этажам</option>
          <option value="section">По секциям</option>
        </select>
        {msg ? <span className="text-sm text-emerald-600">{msg}</span> : null}
        {error ? <span className="text-sm text-rose-600">{error}</span> : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
        {/* Нераспределённые */}
        <Card
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => { if (drag) { run(() => adminApi.opsPlanAssign(drag, null)); setDrag(null); } }}
        >
          <p className="mb-2 text-sm font-medium text-ink">Не распределены <span className="text-slate-400">({unassigned.length})</span></p>
          <div className="space-y-1.5">
            {unassigned.length === 0 ? <p className="text-xs text-slate-400">Пусто. Сгенерируйте уборки по правилам или создайте вручную в «Задачах».</p> : null}
            {group === 'none' ? unassigned.map((t) => taskChip(t, true)) : (
              Object.entries(
                unassigned.reduce<Record<string, OpsTask[]>>((acc, t) => {
                  const key = group === 'floor'
                    ? (t.room?.floor ? `Этаж ${t.room.floor}` : 'Без этажа')
                    : (sections.find((s) => s.id === t.room?.sectionId)?.name ?? 'Без секции');
                  (acc[key] ??= []).push(t);
                  return acc;
                }, {}),
              ).sort(([a], [b]) => a.localeCompare(b, 'ru', { numeric: true })).map(([label, list]) => (
                <div key={label}>
                  <p className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label} · {list.length}</p>
                  <div className="space-y-1.5">{list.map((t) => taskChip(t, true))}</div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Колонки горничных в смене */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(plan?.users ?? []).length === 0 ? (
            <Card><p className="text-sm text-dark-gray">Нет сотрудников «в смене». Сотрудник включает смену на экране «Мои задачи», либо руководитель — в настройках.</p></Card>
          ) : null}
          {(plan?.users ?? []).map((u) => {
            const list = byUser(u.id);
            const minutes = list.reduce((s, t) => s + (t.standardMinutes ?? 30), 0);
            return (
              <Card
                key={u.id}
                className="min-h-32"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (drag) { run(() => adminApi.opsPlanAssign(drag, u.id, byUser(u.id).length + 1)); setDrag(null); } }}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <label className="flex min-w-0 items-center gap-2">
                    <input type="checkbox" checked={selectedUsers.includes(u.id)} onChange={(e) => setSelectedUsers((s) => e.target.checked ? [...s, u.id] : s.filter((x) => x !== u.id))} title="Участвует в автораспределении" />
                    <span className="truncate text-sm font-medium text-ink">{u.name ?? u.email}</span>
                  </label>
                  <span className="shrink-0 text-xs text-slate-400">{list.length} · {minutes} мин</span>
                </div>
                <div className="space-y-1.5">
                  {list.map((t) => taskChip(t, true))}
                </div>
                {list.length > 0 ? (
                  <div className="mt-2 flex gap-3">
                    <button type="button" className="text-xs text-slate-400 hover:text-primary-700" onClick={() => run(() => adminApi.opsPlanSend(date, propertyId || undefined, u.id), 'Отправлено')}>Отправить этому сотруднику</button>
                    <button type="button" className="text-xs text-slate-400 hover:text-primary-700" onClick={() => printPlan(u.id)}>Печать</button>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      </div>

      {openTask ? <TaskCard taskId={openTask} staff={(plan?.users ?? []).map((u) => ({ ...u, onDuty: true, avatarUrl: null }))} onClose={() => setOpenTask(null)} onChanged={load} /> : null}
    </main>
  );
}
