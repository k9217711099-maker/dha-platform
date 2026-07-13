'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card } from '@dha/ui';
import {
  adminApi, opsStreamUrl,
  type OpsChecklist, type OpsGroup, type OpsKind, type OpsRecurring, type OpsStaff,
  type OpsStatus, type OpsTag, type OpsTask, type OpsTemplate, type PmsRoom, type PmsRoomOption,
} from '../../../lib/api';
import { useAdminMe, useRequireAdmin } from '../../../lib/use-admin';
import { DateRangePicker } from '../../../components/DateRangePicker';
import { STATUS, TRANSITIONS, SEVERITY_RU, checklistProgress, dueTier, activityColor, fmtDT } from '../shared';
import { TaskCard } from '../TaskCard';
import { Avatar, CreateTaskModal } from '../CreateTaskModal';
import { TemplatesModal } from '../TemplatesModal';
import { PlannerModal } from '../PlannerModal';

type SortKey = 'creator' | 'assignee' | 'where' | 'title' | 'due' | 'status' | 'activity';

const selectCls = 'rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';

/** Фильтр-исполнитель (§13): выпадающий список с поиском и аватарами, как при создании задачи. */
function AssigneeFilter({ staff, value, onChange }: { staff: OpsStaff[]; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const sel = staff.find((s) => s.id === value);
  const filtered = staff.filter((s) => (s.name ?? s.email ?? '').toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`${selectCls} flex items-center gap-1.5`}>
        {sel ? <><Avatar name={sel.name} url={sel.avatarUrl} size={5} /><span className="max-w-[120px] truncate">{sel.name ?? sel.email}</span></> : <span className="text-slate-500">Все исполнители</span>}
        <span className="text-slate-400">▾</span>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-ink/10 bg-white p-2 shadow-xl">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по имени…" className="mb-2 w-full rounded-md border border-ink/15 px-2.5 py-1.5 text-sm" />
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              <button type="button" onClick={() => { onChange(''); setOpen(false); }} className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm ${!value ? 'bg-primary-50 text-primary-700' : 'hover:bg-slate-50'}`}>Все исполнители</button>
              {filtered.map((s) => (
                <button key={s.id} type="button" onClick={() => { onChange(s.id); setOpen(false); }} className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${value === s.id ? 'bg-primary-50 text-primary-700' : 'hover:bg-slate-50'}`}>
                  <Avatar name={s.name} url={s.avatarUrl} size={5} /><span className="truncate">{s.name ?? s.email}</span>
                </button>
              ))}
              {filtered.length === 0 ? <p className="px-2 py-3 text-center text-xs text-slate-400">Никого не найдено</p> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Фильтр по тегам (§18): выпадающий список с мультивыбором. */
function TagFilter({ tags, selected, onToggle, onClear }: { tags: OpsTag[]; selected: string[]; onToggle: (id: string) => void; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  if (tags.length === 0) return null;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={`${selectCls} flex items-center gap-1.5`}>
        <span className={selected.length ? 'text-ink' : 'text-slate-500'}>Теги{selected.length ? `: ${selected.length}` : ''}</span>
        <span className="text-slate-400">▾</span>
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-30 mt-1 w-56 rounded-lg border border-ink/10 bg-white p-2 shadow-xl">
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              {tags.map((t) => (
                <button key={t.id} type="button" onClick={() => onToggle(t.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-slate-50">
                  <span className="h-3.5 w-3.5 shrink-0 rounded-sm border" style={{ backgroundColor: selected.includes(t.id) ? t.color : 'transparent', borderColor: t.color }} />
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="truncate">{t.name}</span>
                </button>
              ))}
            </div>
            {selected.length ? <button type="button" onClick={onClear} className="mt-1 w-full rounded-md px-2 py-1 text-left text-xs text-rose-500 hover:bg-rose-50">Сбросить теги</button> : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Задачи и Уборки (TASKS-HOUSEKEEPING-TZ §4.2): таблица в стиле TeamJet. */
export default function OpsTasksPage() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  const searchRef = useRef<HTMLInputElement>(null);

  const param = (key: string) => (typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get(key) ?? '');
  const [kind, setKind] = useState<'' | OpsKind>(() => { const k = param('kind'); return k === 'TASK' || k === 'CLEANING' ? k : ''; });
  const [roomId, setRoomId] = useState(() => param('roomId'));
  const [zoneIdF, setZoneIdF] = useState(() => param('zoneId'));
  // Фильтры: статусы — мультиселект чипами
  const [statuses, setStatuses] = useState<OpsStatus[]>([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [important, setImportant] = useState(false);
  const [overdue, setOverdue] = useState(false);
  const [target, setTarget] = useState<'' | 'ADMIN' | 'LOCATED'>('');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [tasks, setTasks] = useState<OpsTask[]>([]);
  const [staff, setStaff] = useState<OpsStaff[]>([]);
  const [groups, setGroups] = useState<OpsGroup[]>([]);
  const [tags, setTags] = useState<OpsTag[]>([]);
  const [options, setOptions] = useState<PmsRoomOption[]>([]);
  const [rooms, setRooms] = useState<PmsRoom[]>([]);
  const [zones, setZones] = useState<{ id: string; propertyId: string; name: string }[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  // Шаблоны и планировщик — окна раздела «Задачи» (перенесены из настроек).
  const [showTemplates, setShowTemplates] = useState(false);
  const [showPlanner, setShowPlanner] = useState(false);
  const [plannerForm, setPlannerForm] = useState<{ open: boolean; rule: OpsRecurring | null }>({ open: false, rule: null });
  const [presetTemplate, setPresetTemplate] = useState<OpsTemplate | null>(null);
  const [checklists, setChecklists] = useState<OpsChecklist[]>([]);
  // Inline status change
  const [statusMenuTask, setStatusMenuTask] = useState<string | null>(null);
  // Row menu (МЕНЮ)
  const [menuTask, setMenuTask] = useState<string | null>(null);

  const filters = useMemo(() => ({
    kind: kind || undefined,
    statuses: statuses.length ? statuses.join(',') : undefined,
    assigneeId: assigneeId || undefined,
    groupId: groupId || undefined,
    tagIds: tagIds.length ? tagIds.join(',') : undefined,
    propertyId: propertyId || undefined,
    roomId: roomId || undefined,
    zoneId: zoneIdF || undefined,
    important: important ? '1' : undefined,
    overdue: overdue ? '1' : undefined,
    target: target || undefined,
    q: q || undefined, from: from || undefined, to: to || undefined,
  }), [kind, statuses, assigneeId, groupId, tagIds, propertyId, roomId, zoneIdF, important, overdue, target, q, from, to]);

  const load = () => adminApi.opsTasks(filters).then(setTasks).catch(() => undefined);

  useEffect(() => {
    if (!ready) return;
    void adminApi.opsStaff().then(setStaff).catch(() => undefined);
    void adminApi.opsGroups().then(setGroups).catch(() => undefined);
    void adminApi.opsTags().then(setTags).catch(() => undefined);
    void adminApi.pmsRoomOptions().then(setOptions).catch(() => undefined);
    void adminApi.pmsRooms().then(setRooms).catch(() => undefined);
    void adminApi.opsZones().then(setZones).catch(() => undefined);
    void adminApi.opsChecklists().then(setChecklists).catch(() => undefined);
  }, [ready]);
  useEffect(() => { if (ready) void load(); }, [ready, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    const url = opsStreamUrl();
    if (!url) return;
    const es = new EventSource(url);
    es.onmessage = (e) => { try { if (JSON.parse(e.data as string).kind !== 'ping') void load(); } catch { /* ignore */ } };
    return () => es.close();
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Закрыть меню при клике вне
  useEffect(() => {
    const handler = () => { setStatusMenuTask(null); setMenuTask(null); };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const hasFilters = Boolean(statuses.length || assigneeId || groupId || tagIds.length || propertyId || roomId || zoneIdF || important || overdue || target || q || from);
  const canCreate = me?.permissions.includes('ops_create') ?? false;
  const canChangeStatus = me?.permissions.includes('ops_tasks') ?? false;

  const toggleStatus = (s: OpsStatus) => setStatuses((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  const toggleTag = (id: string) => setTagIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const resetFilters = () => { setStatuses([]); setAssigneeId(''); setGroupId(''); setTagIds([]); setPropertyId(''); setRoomId(''); setZoneIdF(''); setImportant(false); setOverdue(false); setTarget(''); setQ(''); setFrom(''); setTo(''); };

  const doStatusChange = async (taskId: string, to: OpsStatus, e: React.MouseEvent) => {
    e.stopPropagation();
    setStatusMenuTask(null);
    await adminApi.opsStatus(taskId, to).catch(() => undefined);
    void load();
  };

  // Группировка по дате создания (как в TeamJet) — активна, пока не выбрана сортировка по столбцу.
  const grouped = useMemo(() => {
    const map = new Map<string, OpsTask[]>();
    const today = new Date().toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
    tasks.forEach((t) => {
      const d = new Date(t.createdAt);
      const label = d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }) === today
        ? `Сегодня (${d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })})`
        : d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(t);
    });
    return map;
  }, [tasks]);

  // Сортировка по столбцу (клик по заголовку): asc → desc → выкл (обратно к группировке по дате).
  const STATUS_ORDER: OpsStatus[] = ['PLAN', 'NEW', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED', 'WAITING_CONFIRM', 'DONE', 'CANCELLED'];
  const nameOf = (id?: string | null) => { const u = id ? staffMap.get(id) : null; return (u?.name ?? u?.email ?? '').toLowerCase(); };
  const sortedTasks = useMemo(() => {
    if (!sort) return null;
    const dir = sort.dir === 'asc' ? 1 : -1;
    const val = (t: OpsTask): string | number => {
      switch (sort.key) {
        case 'creator': return nameOf(t.createdBy);
        case 'assignee': return t.group?.name?.toLowerCase() ?? nameOf(t.assignees[0]?.userId);
        case 'where': return (t.room ? t.room.number : t.zone?.name ?? '~').toLowerCase();
        case 'title': return t.title.toLowerCase();
        case 'due': return t.dueAt ? new Date(t.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
        case 'status': return STATUS_ORDER.indexOf(t.status);
        case 'activity': return new Date(t.lastActivityAt).getTime();
        default: return 0;
      }
    };
    return [...tasks].sort((a, b) => { const va = val(a), vb = val(b); return va < vb ? -dir : va > vb ? dir : 0; });
  }, [sort, tasks, staffMap]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleSort = (key: SortKey) => setSort((s) => (s && s.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : null) : { key, dir: 'asc' }));
  const sortTh = (key: SortKey, label: string, extra = '') => (
    <th className={`py-2.5 pr-3 cursor-pointer select-none hover:text-ink ${extra}`} onClick={() => toggleSort(key)}>
      <span className="inline-flex items-center gap-1">{label}<span className={sort?.key === key ? 'text-indigo-500' : 'text-slate-300'}>{sort?.key === key ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}</span></span>
    </th>
  );

  const renderRow = (t: OpsTask, n: number) => {
    const st = STATUS[t.status];
    const dt = dueTier(t.dueAt, t.status);
    const ac = activityColor(t.dueAt, t.status, t.lastActivityAt);
    const creator = t.createdBy ? staffMap.get(t.createdBy) : null;
    const assignee = t.assignees[0] ? staffMap.get(t.assignees[0].userId) : null;
    const cl = t.checklists[0];
    const isMenuOpen = menuTask === t.id;
    const isStatusOpen = statusMenuTask === t.id;
    const allowedTransitions = canChangeStatus ? TRANSITIONS[t.status] : [];
    const unread = t.unread ?? 0;
    return (
      <Fragment key={t.id}>
        <tr className={`group border-b border-ink/5 cursor-pointer transition-colors hover:bg-slate-50 ${isMenuOpen ? 'bg-slate-50' : ''}`} onClick={() => setOpenTask(t.id)}>
          {/* Фикс-ширина + оверлей «МЕНЮ» (§17): не меняем ширину колонки на hover → нет дрожания/«троения» */}
          <td className="relative w-14 min-w-14 pl-4 pr-2 py-2.5 align-middle">
            <span className="text-xs text-slate-400 font-mono">{n}</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); setMenuTask(isMenuOpen ? null : t.id); setStatusMenuTask(null); }} className="absolute left-3 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-ink/20 bg-white px-1.5 py-0.5 text-xs font-medium text-ink shadow-sm hover:bg-slate-50 group-hover:inline-flex">МЕНЮ</button>
          </td>
          <td className="py-2.5 pr-3 align-middle">
            {creator ? (
              <div className="flex items-center gap-1.5">
                <Avatar name={creator.name} url={creator.avatarUrl} size={6} />
                <div className="min-w-0"><p className="text-xs font-medium text-ink truncate max-w-[80px]">{creator.name ?? creator.email}</p><p className="text-[10px] text-slate-400 truncate max-w-[80px]">{creator.roleKey ?? ''}</p></div>
              </div>
            ) : <span className="text-xs text-slate-400">—</span>}
          </td>
          <td className="py-2.5 pr-3 align-middle">
            {t.group ? (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold" style={{ backgroundColor: t.group.color }}>{t.group.name[0]}</span>
                <div><p className="text-xs font-medium text-ink">{t.group.name}</p>{assignee ? <p className="text-[10px] text-slate-400">{assignee.name ?? assignee.email}</p> : <p className="text-[10px] text-slate-400">Без исполнителя</p>}</div>
              </div>
            ) : assignee ? (
              <div className="flex items-center gap-1.5">
                <Avatar name={assignee.name} url={assignee.avatarUrl} size={6} />
                <div className="min-w-0"><p className="text-xs font-medium text-ink truncate max-w-[80px]">{assignee.name ?? assignee.email}</p>{t.assignees.length > 1 ? <p className="text-[10px] text-slate-400">+{t.assignees.length - 1}</p> : null}</div>
              </div>
            ) : <span className="text-xs text-slate-400 italic">Без исполнителя</span>}
          </td>
          <td className="py-2.5 pr-3 align-middle text-xs text-ink">
            {t.room ? `№${t.room.number}${t.room.floor ? ` (эт.${t.room.floor})` : ''}` : t.zone?.name ?? '—'}
            {t.room?.dndUntil && new Date(t.room.dndUntil) > new Date() ? <span className="ml-1 rounded-sm bg-slate-200 px-1 text-[10px] text-slate-500">DND</span> : null}
          </td>
          <td className="py-2.5 pr-3 align-middle max-w-[260px]">
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-ink">
              {t.important ? <span title="Важная">🔥</span> : null}
              {t.severity !== 'MINOR' ? <span className="text-rose-500 font-medium">{SEVERITY_RU[t.severity]}</span> : null}
              {t.blocksSale ? <span className="rounded bg-rose-100 px-1 py-0.5 text-[10px] text-rose-700">ремонт</span> : null}
              <span className="font-medium truncate">{t.title}</span>
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400 truncate">{t.kind === 'CLEANING' ? 'Уборка · ' : ''}{fmtDT(t.createdAt)}{cl ? ` · чек-лист ${checklistProgress(cl.itemsSnapshot, cl.answers)}%` : ''}</p>
          </td>
          <td className="py-2.5 pr-3 align-middle">
            <div className="flex flex-wrap gap-1">{t.tags.map((x) => (<span key={x.tagId} className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${x.tag.color}22`, color: x.tag.color }}>{x.tag.name}</span>))}</div>
          </td>
          <td className="py-2.5 pr-3 align-middle text-xs">
            {t.dueAt ? (dt
              ? <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ${dt.cls}`} title={dt.label}><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: dt.dot }} />{fmtDT(t.dueAt)}</span>
              : <span className="text-slate-400">{fmtDT(t.dueAt)}</span>) : <span className="text-slate-300">—</span>}
          </td>
          <td className="py-2.5 pr-3 align-middle">
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button type="button" onClick={() => { setStatusMenuTask(isStatusOpen ? null : t.id); setMenuTask(null); }} className={`rounded-full px-2.5 py-1 text-xs font-medium transition hover:opacity-90 ${st.cls}`}>{st.label}</button>
              {isStatusOpen && allowedTransitions.length > 0 ? (
                <div className="absolute right-0 top-full z-30 mt-1 w-36 rounded-lg border border-ink/10 bg-white shadow-xl">
                  {allowedTransitions.map((next) => (
                    <button key={next} type="button" onClick={(e) => void doStatusChange(t.id, next, e)} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium transition hover:bg-slate-50 ${STATUS[next].cls} rounded-none first:rounded-t-lg last:rounded-b-lg`}>
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: STATUS[next].dot }} />{STATUS[next].label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </td>
          <td className="py-2.5 pr-3 align-middle text-xs">
            <div className="flex items-center gap-1.5">
              <span className={`${ac.cls} ${ac.bold ? 'font-bold' : ''}`} title={dt ? `Срок: ${dt.label}` : 'Последняя активность'}>{fmtDT(t.lastActivityAt)}</span>
              {dt?.label === 'просрочено' ? <span className="rounded bg-rose-500 px-1 text-[10px] font-semibold text-white" title="Просрочено">!</span> : null}
              {unread > 0 ? <span className="inline-flex items-center rounded-full bg-indigo-500 px-1.5 text-[10px] font-semibold text-white" title="Непрочитанные комментарии">💬 {unread}</span>
                : (t._count?.comments ?? 0) > 0 ? <span className="text-[10px] text-slate-400">💬 {t._count!.comments}</span> : null}
            </div>
          </td>
          <td className="py-2.5 pr-3 align-middle text-slate-300">{t.watchers.length > 0 ? <span title="Есть наблюдатели">👁</span> : null}</td>
        </tr>
        {isMenuOpen ? (
          <tr className="border-b border-ink/5 bg-slate-50">
            <td colSpan={10} className="px-4 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" onClick={(e) => { e.stopPropagation(); setMenuTask(null); setOpenTask(t.id); }} className="rounded-md bg-white border border-ink/15 px-3 py-1 text-xs font-medium text-ink hover:bg-slate-100">Редактировать</button>
                <button type="button" onClick={(e) => { e.stopPropagation(); setMenuTask(null); void cloneTask(t.id); }} className="rounded-md bg-white border border-ink/15 px-3 py-1 text-xs font-medium text-ink hover:bg-slate-100">Клонировать</button>
                {me?.permissions.includes('ops_manage') ? <button type="button" onClick={(e) => { e.stopPropagation(); setMenuTask(null); void deleteTask(t.id); }} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100">Удалить</button> : null}
                {t.status !== 'CANCELLED' && t.status !== 'DONE' ? <button type="button" onClick={(e) => { e.stopPropagation(); setMenuTask(null); void doStatusChange(t.id, 'CANCELLED', e); }} className="rounded-md border border-ink/15 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">Отменить</button> : null}
              </div>
            </td>
          </tr>
        ) : null}
      </Fragment>
    );
  };

  let rowIndex = 0;

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-light text-ink">Операции · Задачи</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void adminApi.opsExportTasks(filters)}>Excel</Button>
          <Button variant="secondary" onClick={() => setShowPlanner(true)}>🗓 Планировщик</Button>
          <Button variant="secondary" onClick={() => setShowTemplates(true)}>📋 Шаблоны</Button>
          {canCreate ? <Button onClick={() => setCreating(true)}>Добавить задачу</Button> : null}
        </div>
      </div>

      {/* Табы: вид (Задачи/Уборки) + тип привязки (Административные/Номер·Зона) — §18 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm" style={{ width: 'fit-content' }}>
          {([['', 'Все'], ['TASK', 'Задачи'], ['CLEANING', 'Уборки']] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setKind(v as '' | OpsKind)} className={`rounded-md px-4 py-1.5 transition ${kind === v ? 'bg-white font-medium text-ink shadow-sm' : 'text-slate-500 hover:text-ink'}`}>{l}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Тип задачи:</span>
          <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm" style={{ width: 'fit-content' }}>
            {([['', 'Любые'], ['LOCATED', 'Номер / зона'], ['ADMIN', 'Административные']] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setTarget(v as '' | 'ADMIN' | 'LOCATED')} className={`rounded-md px-3 py-1.5 transition ${target === v ? 'bg-white font-medium text-ink shadow-sm' : 'text-slate-500 hover:text-ink'}`}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Фильтры: строка 1 — поиск, статусы-чипы, исполнитель, объект */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative">
          <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по задачам…" className={`${selectCls} w-52`} />
          {q ? <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-ink">×</button> : null}
        </div>
        {/* Статусы — кликабельные чипы с цветным контуром */}
        <div className="flex flex-wrap gap-1">
          {(Object.entries(STATUS) as [OpsStatus, typeof STATUS[OpsStatus]][]).map(([s, info]) => {
            const on = statuses.includes(s);
            return (
              <button
                key={s} type="button"
                onClick={() => toggleStatus(s)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${on ? `${info.cls} border-transparent shadow-sm` : 'hover:opacity-80'}`}
                style={on ? {} : { color: info.dot, borderColor: info.dot }}
              >{info.label}</button>
            );
          })}
        </div>
        <AssigneeFilter staff={staff} value={assigneeId} onChange={setAssigneeId} />
        {groups.length > 0 ? (
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={selectCls}>
            <option value="">Все отделы</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        ) : null}
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={selectCls}>
          <option value="">Все объекты</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {/* Где: номер / зона */}
        <select value={roomId} onChange={(e) => { setRoomId(e.target.value); if (e.target.value) setZoneIdF(''); }} className={selectCls}>
          <option value="">Все номера</option>
          {rooms.filter((r) => !propertyId || r.property.id === propertyId).map((r) => <option key={r.id} value={r.id}>№{r.number}</option>)}
        </select>
        {zones.length > 0 ? (
          <select value={zoneIdF} onChange={(e) => { setZoneIdF(e.target.value); if (e.target.value) setRoomId(''); }} className={selectCls}>
            <option value="">Все зоны</option>
            {zones.filter((z) => !propertyId || z.propertyId === propertyId).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        ) : null}
        <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} className="w-56" placeholder="Период создания" />
      </div>

      {/* Фильтры: строка 2 — теги (выпадающий список), дополнительные флаги */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <TagFilter tags={tags} selected={tagIds} onToggle={toggleTag} onClear={() => setTagIds([])} />
        <button
          type="button" onClick={() => setImportant((v) => !v)}
          className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${important ? 'border-transparent bg-amber-100 text-amber-700 shadow-sm' : 'border-ink/15 text-slate-500 hover:border-amber-300'}`}
        >🔥 Важные</button>
        <button
          type="button" onClick={() => setOverdue((v) => !v)}
          className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${overdue ? 'border-transparent bg-rose-500 text-white shadow-sm' : 'border-rose-300 text-rose-600 hover:bg-rose-50'}`}
        >⏰ Просроченные</button>
        {hasFilters ? (
          <button type="button" className="flex items-center gap-1 text-sm text-rose-500 hover:text-rose-700" onClick={resetFilters}>
            <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />Сбросить фильтры
          </button>
        ) : null}
        <span className="ml-auto text-xs text-slate-400">{tasks.length} задач{tasks.length === 1 ? 'а' : tasks.length >= 2 && tasks.length <= 4 ? 'и' : ''}</span>
      </div>

      {/* Таблица в стиле TeamJet */}
      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2.5 pl-4 pr-2 w-8">#</th>
              {sortTh('creator', 'Создатель')}
              {sortTh('assignee', 'Исполнитель')}
              {sortTh('where', 'Где')}
              {sortTh('title', 'Детали')}
              <th className="py-2.5 pr-3">Теги</th>
              {sortTh('due', 'Срок')}
              {sortTh('status', 'Статус')}
              {sortTh('activity', 'Активность')}
              <th className="py-2.5 pr-3 w-6" />
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr><td colSpan={10} className="py-10 text-center text-sm text-slate-400">Задач нет.</td></tr>
            ) : null}
            {sortedTasks
              ? sortedTasks.map((t, i) => renderRow(t, i + 1))
              : Array.from(grouped.entries()).map(([dateLabel, dayTasks]) => (
                  <Fragment key={`grp-${dateLabel}`}>
                    <tr><td colSpan={10} className="bg-slate-50/80 px-4 py-1.5 text-xs font-semibold text-indigo-600">{dateLabel}</td></tr>
                    {dayTasks.map((t) => { rowIndex += 1; return renderRow(t, rowIndex); })}
                  </Fragment>
                ))}
          </tbody>
        </table>
      </Card>

      {openTask ? <TaskCard taskId={openTask} staff={staff} onClose={() => setOpenTask(null)} onChanged={load} /> : null}
      {creating ? (
        <CreateTaskModal
          staff={staff} groups={groups} tags={tags} options={options} defaultKind={kind || 'TASK'}
          initialTemplate={presetTemplate}
          onClose={() => { setCreating(false); setPresetTemplate(null); void adminApi.opsTags().then(setTags).catch(() => undefined); }}
          onCreated={() => { setCreating(false); setPresetTemplate(null); void load(); void adminApi.opsTags().then(setTags).catch(() => undefined); }}
        />
      ) : null}
      {showTemplates ? (
        <TemplatesModal
          staff={staff} groups={groups} tags={tags} checklists={checklists}
          canManage={me?.permissions.includes('ops_settings') ?? false}
          onClose={() => { setShowTemplates(false); void adminApi.opsTags().then(setTags).catch(() => undefined); }}
          onUseTemplate={(tpl) => { setShowTemplates(false); setPresetTemplate(tpl); setCreating(true); }}
        />
      ) : null}
      {showPlanner ? (
        <PlannerModal
          staff={staff} groups={groups}
          canManage={me?.permissions.includes('ops_settings') ?? false}
          onClose={() => setShowPlanner(false)}
          onCreate={() => { setShowPlanner(false); setPlannerForm({ open: true, rule: null }); }}
          onEdit={(rule) => { setShowPlanner(false); setPlannerForm({ open: true, rule }); }}
        />
      ) : null}
      {plannerForm.open ? (
        <CreateTaskModal
          mode="recurring" editRule={plannerForm.rule}
          staff={staff} groups={groups} tags={tags} options={options} defaultKind="TASK"
          onClose={() => { setPlannerForm({ open: false, rule: null }); setShowPlanner(true); }}
          onCreated={() => { setPlannerForm({ open: false, rule: null }); setShowPlanner(true); }}
        />
      ) : null}
    </main>
  );

  async function cloneTask(id: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    await adminApi.opsCreateTask({
      kind: t.kind, title: `${t.title} (копия)`, description: t.description ?? undefined,
      propertyId: t.propertyId, roomId: t.roomId ?? undefined, zoneId: t.zoneId ?? undefined,
      cleaningTypeId: t.cleaningTypeId ?? undefined, groupId: t.group?.id ?? undefined,
      assigneeIds: t.assignees.map((a) => a.userId), tagIds: t.tags.map((x) => x.tagId),
      important: t.important, severity: t.severity, blocksSale: t.blocksSale, requireConfirmation: t.requireConfirmation,
    }).catch(() => undefined);
    void load();
  }

  async function deleteTask(id: string) {
    if (!confirm('Удалить задачу?')) return;
    await adminApi.opsDeleteTask(id).catch(() => undefined);
    void load();
  }
}
