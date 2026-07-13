'use client';

import { useEffect, useState } from 'react';
import { Button } from '@dha/ui';
import {
  adminApi,
  type CleaningType, type OpsChecklist, type OpsGroup, type OpsKind, type OpsRecurring,
  type OpsStaff, type OpsTag, type OpsTemplate, type PmsRoom, type PmsRoomOption,
} from '../../lib/api';
import { DatePicker } from '../../components/DatePicker';
import { SEVERITY_RU } from './shared';

/** Палитра цветов тегов (§4.1) — быстрый выбор при создании тега прямо в задаче. */
export const TAG_PALETTE = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b'];

/** Аватар-заглушка из инициалов. */
export function Avatar({ name, url, size = 7 }: { name: string | null; url?: string | null; size?: number }) {
  const initials = (name ?? '?').split(' ').map((p) => p[0]).join('').toUpperCase().slice(0, 2);
  const cls = `inline-flex shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 font-medium text-xs select-none`;
  const style = { width: `${size * 4}px`, height: `${size * 4}px` } as React.CSSProperties;
  if (url) return <img src={url} alt={name ?? ''} className={`${cls} object-cover`} style={style} />;
  return <span className={cls} style={style}>{initials}</span>;
}

/** Выбор сотрудников с поиском и аватарами (для исполнителей и наблюдателей). */
export function PersonPicker({ staff, selected, onToggle, placeholder = 'Поиск по имени…' }: {
  staff: OpsStaff[]; selected: string[]; onToggle: (id: string) => void; placeholder?: string;
}) {
  const [search, setSearch] = useState('');
  const list = search.trim() ? staff.filter((s) => (s.name ?? s.email).toLowerCase().includes(search.trim().toLowerCase())) : staff;
  return (
    <>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder} className="mb-2 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm" />
      <div className="flex max-h-32 flex-col gap-1 overflow-y-auto">
        {list.map((s) => (
          <button key={s.id} type="button" onClick={() => onToggle(s.id)} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${selected.includes(s.id) ? 'bg-primary-50 text-primary-700' : 'hover:bg-slate-50 text-ink'}`}>
            <Avatar name={s.name} url={s.avatarUrl} size={6} />
            <div className="min-w-0"><p className="font-medium truncate">{s.name ?? s.email}</p>{s.roleKey ? <p className="text-[10px] text-slate-400">{s.roleKey}</p> : null}</div>
            {selected.includes(s.id) ? <span className="ml-auto text-xs text-primary-600">✓</span> : null}
          </button>
        ))}
        {list.length === 0 ? <p className="px-2 py-1 text-xs text-slate-400">Никого не найдено</p> : null}
      </div>
    </>
  );
}

/** Дата+время в стиле проекта (DatePicker + время) вместо нативного datetime-local. */
export function DateTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const parts = value ? value.split('T') : [];
  const datePart = parts[0] ?? '';
  const timePart = parts[1] ?? '';
  return (
    <div className="flex gap-2">
      <DatePicker value={datePart} onChange={(d) => onChange(d ? `${d}T${timePart || '09:00'}` : '')} className="flex-1" placeholder="Дата" />
      <input type="time" value={timePart} onChange={(e) => datePart && onChange(`${datePart}T${e.target.value || '09:00'}`)} disabled={!datePart} className="rounded-md border border-ink/20 px-2 py-2 text-sm disabled:opacity-40" />
    </div>
  );
}

const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/**
 * Модалка создания задачи (§4.1) и — в режиме mode="recurring" — правила планировщика:
 * та же форма задачи + блок «Повторяемость» (частота/время создания/дни/интервал/дата начала).
 */
export function CreateTaskModal({ staff, groups, tags, options, defaultKind, onClose, onCreated, mode = 'task', editRule, initialTemplate, presetRoom }: {
  staff: OpsStaff[];
  groups: OpsGroup[];
  tags: OpsTag[];
  options: PmsRoomOption[];
  defaultKind: OpsKind;
  onClose: () => void;
  onCreated: () => void;
  /** 'recurring' — создаём/редактируем правило планировщика вместо разовой задачи. */
  mode?: 'task' | 'recurring';
  /** Правило для редактирования (mode='recurring'). */
  editRule?: OpsRecurring | null;
  /** Шаблон, применяемый при открытии («Создать задачу» из окна шаблонов). */
  initialTemplate?: OpsTemplate | null;
  /** Предустановленный номер (создание из карточки номера на шахматке). */
  presetRoom?: { propertyId: string; roomId: string } | null;
}) {
  const [rooms, setRooms] = useState<PmsRoom[]>([]);
  const [types, setTypes] = useState<CleaningType[]>([]);
  const [checklists, setChecklists] = useState<OpsChecklist[]>([]);
  const [templates, setTemplates] = useState<OpsTemplate[]>([]);
  const [zones, setZones] = useState<{ id: string; propertyId: string; name: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<OpsKind>(defaultKind);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [cleaningTypeId, setCleaningTypeId] = useState('');
  const [assigneeMode, setAssigneeMode] = useState<'person' | 'group'>('person');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [assigneeGroupId, setAssigneeGroupId] = useState('');
  const [watcherIds, setWatcherIds] = useState<string[]>([]);
  const [localTags, setLocalTags] = useState<OpsTag[]>(tags);
  const [newTag, setNewTag] = useState('');
  const [tagSearch, setTagSearch] = useState('');
  const [newTagColor, setNewTagColor] = useState<string>(TAG_PALETTE[0] ?? '#6366f1');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [checklistIds, setChecklistIds] = useState<string[]>([]);
  const [important, setImportant] = useState(false);
  const [severity, setSeverity] = useState('MINOR');
  const [blocksSale, setBlocksSale] = useState(false);
  const [guestRequest, setGuestRequest] = useState(false);
  const [requirePhotoResult, setRequirePhotoResult] = useState(false);
  const [requireConfirmation, setRequireConfirmation] = useState(false);
  const [dueAt, setDueAt] = useState('');
  const [acceptBy, setAcceptBy] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [appliedTemplateId, setAppliedTemplateId] = useState('');
  const [targetType, setTargetType] = useState<'room' | 'zone' | 'admin'>('room');
  const [files, setFiles] = useState<File[]>([]);

  // Повторяемость (mode='recurring'): гибкое расписание + время создания задачи.
  const [freq, setFreq] = useState<'DAILY' | 'WEEKLY' | 'MONTHLY' | 'INTERVAL'>('DAILY');
  const [time, setTime] = useState('09:00');
  const [days, setDays] = useState<number[]>([]);
  const [intervalDays, setIntervalDays] = useState('3');
  const [startDate, setStartDate] = useState('');

  useEffect(() => {
    void adminApi.pmsRooms().then(setRooms).catch(() => undefined);
    void adminApi.opsCleaningTypes().then(setTypes).catch(() => undefined);
    void adminApi.opsChecklists().then(setChecklists).catch(() => undefined);
    void adminApi.opsTemplates().then(setTemplates).catch(() => undefined);
    void adminApi.opsZones().then(setZones).catch(() => undefined);
  }, []);
  useEffect(() => { if (!propertyId && options[0]) setPropertyId(options[0].id); }, [options, propertyId]);
  useEffect(() => { setLocalTags(tags); }, [tags]);
  useEffect(() => { if (kind === 'CLEANING' && targetType === 'admin') setTargetType('room'); }, [kind, targetType]);
  // Заполнение из редактируемого правила планировщика.
  useEffect(() => {
    if (!editRule) return;
    const p = editRule.payload as Record<string, unknown>;
    applyPayload(p);
    setFreq(editRule.freq);
    setTime(editRule.time);
    setDays(editRule.days);
    if (editRule.intervalDays) setIntervalDays(String(editRule.intervalDays));
    if (editRule.startDate) setStartDate(editRule.startDate.slice(0, 10));
    if (!p.title && editRule.name) setTitle(editRule.name);
  }, [editRule]); // eslint-disable-line react-hooks/exhaustive-deps
  // Применение шаблона, переданного при открытии.
  useEffect(() => { if (initialTemplate) { applyPayload(initialTemplate.payload); setAppliedTemplateId(initialTemplate.id); } }, [initialTemplate]); // eslint-disable-line react-hooks/exhaustive-deps
  // Предустановленный номер (карточка номера на шахматке).
  useEffect(() => {
    if (!presetRoom) return;
    setPropertyId(presetRoom.propertyId);
    setTargetType('room');
    setRoomId(presetRoom.roomId);
  }, [presetRoom]);

  const propRooms = rooms.filter((r) => r.property.id === propertyId);
  const propZones = zones.filter((z) => z.propertyId === propertyId);
  // Поиск по тегам: выбранные показываем всегда, остальные — по подстроке.
  const visibleTags = localTags.filter((t) => tagIds.includes(t.id) || !tagSearch.trim() || t.name.toLowerCase().includes(tagSearch.trim().toLowerCase()));
  const createTag = async () => {
    if (!newTag.trim()) return;
    const t = await adminApi.opsCreateTag({ name: newTag.trim(), color: newTagColor }).catch(() => null);
    if (t) { setLocalTags((p) => [...p, t]); setTagIds((p) => [...p, t.id]); setNewTag(''); }
  };

  /** Применить payload шаблона/правила к форме (все поля TeamJet: отдел, срок-офсет, критичность…). */
  function applyPayload(p: Record<string, unknown>) {
    if (p.title) setTitle(String(p.title));
    if (p.description) setDescription(String(p.description));
    if (p.kind === 'TASK' || p.kind === 'CLEANING') setKind(p.kind);
    if (typeof p.propertyId === 'string' && p.propertyId) setPropertyId(p.propertyId);
    if (typeof p.roomId === 'string' && p.roomId) { setTargetType('room'); setRoomId(p.roomId); }
    if (typeof p.zoneId === 'string' && p.zoneId) { setTargetType('zone'); setZoneId(p.zoneId); }
    if (Array.isArray(p.tagIds)) setTagIds(p.tagIds as string[]);
    if (Array.isArray(p.checklistIds)) setChecklistIds(p.checklistIds as string[]);
    if (Array.isArray(p.assigneeIds) && (p.assigneeIds as string[]).length) { setAssigneeMode('person'); setAssigneeIds(p.assigneeIds as string[]); }
    if (typeof p.groupId === 'string' && p.groupId) { setAssigneeMode('group'); setAssigneeGroupId(p.groupId); }
    if (Array.isArray(p.watcherIds)) setWatcherIds(p.watcherIds as string[]);
    if (p.important !== undefined) setImportant(Boolean(p.important));
    if (typeof p.severity === 'string') setSeverity(p.severity);
    if (p.guestRequest !== undefined) setGuestRequest(Boolean(p.guestRequest));
    if (p.requirePhotoResult !== undefined) setRequirePhotoResult(Boolean(p.requirePhotoResult));
    if (p.requireConfirmation !== undefined) setRequireConfirmation(Boolean(p.requireConfirmation));
    // Срок-офсет шаблона («+30 мин») — от текущего момента.
    if (typeof p.dueOffsetMinutes === 'number' && mode === 'task') {
      const d = new Date(Date.now() + p.dueOffsetMinutes * 60_000);
      const pad = (n: number) => String(n).padStart(2, '0');
      setDueAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
    }
  }

  const applyTemplate = (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    applyPayload(tpl.payload);
    setAppliedTemplateId(tpl.id);
  };

  const toggleArr = (list: string[], set: (v: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const hasAssignee = assigneeMode === 'person' ? assigneeIds.length > 0 : Boolean(assigneeGroupId);
  const targetOk = kind !== 'CLEANING' || (targetType === 'room' ? Boolean(roomId) : targetType === 'zone' ? Boolean(zoneId) : false);
  const scheduleOk = mode !== 'recurring'
    || (freq === 'DAILY') || (freq === 'INTERVAL' && Number(intervalDays) >= 1) || ((freq === 'WEEKLY' || freq === 'MONTHLY') && days.length > 0);
  const canSubmit = title.trim() && hasAssignee && targetOk && scheduleOk && !busy;

  /** Поля задачи (общие для разовой задачи и payload правила планировщика). */
  const taskBody = () => ({
    kind, title, description: description || undefined,
    propertyId: propertyId || undefined,
    roomId: targetType === 'room' ? roomId || undefined : undefined,
    zoneId: targetType === 'zone' ? zoneId || undefined : undefined,
    cleaningTypeId: kind === 'CLEANING' ? cleaningTypeId || undefined : undefined,
    assigneeIds: assigneeMode === 'person' ? assigneeIds : [],
    groupId: assigneeMode === 'group' ? assigneeGroupId || undefined : undefined,
    watcherIds, tagIds, checklistIds,
    important, severity, blocksSale, guestRequest, requirePhotoResult, requireConfirmation,
  });

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      if (mode === 'recurring') {
        await adminApi.opsSaveRecurring({
          name: title.trim(),
          payload: taskBody(),
          freq, time,
          days: freq === 'WEEKLY' || freq === 'MONTHLY' ? days : [],
          intervalDays: freq === 'INTERVAL' ? Number(intervalDays) : undefined,
          startDate: startDate ? new Date(`${startDate}T00:00:00`).toISOString() : undefined,
        }, editRule?.id);
        onCreated();
        return;
      }
      const created = await adminApi.opsCreateTask({
        ...taskBody(),
        templateId: appliedTemplateId || undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        acceptBy: acceptBy ? new Date(acceptBy).toISOString() : undefined,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
      });
      for (const f of files) await adminApi.opsAttach(created.id, f).catch(() => undefined);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      setBusy(false);
    }
  };

  const heading = mode === 'recurring'
    ? (editRule ? 'Повторяющаяся задача — правка' : 'Новая повторяющаяся задача')
    : `Новая ${kind === 'CLEANING' ? 'уборка' : 'задача'}`;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={onClose}>
      <div className="my-4 w-full max-w-2xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <div className="flex items-center gap-2">
            <button
              type="button" onClick={() => setImportant((v) => !v)} title={important ? 'Важная — снять' : 'Отметить важной'}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-lg transition ${important ? 'bg-amber-100' : 'opacity-30 grayscale hover:opacity-60'}`}
            >🔥</button>
            <h2 className="text-lg font-semibold text-ink">{heading}{important ? <span className="ml-2 align-middle text-xs font-medium text-amber-600">важная</span> : null}</h2>
          </div>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-slate-400 hover:text-ink">×</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          {/* Тип задачи + шаблон */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
              {([['TASK', 'Задача'], ['CLEANING', 'Уборка']] as const).map(([v, l]) => (
                <button key={v} type="button" onClick={() => setKind(v)} className={`rounded-md px-3 py-1 transition ${kind === v ? 'bg-white font-medium text-ink shadow-sm' : 'text-slate-500'}`}>{l}</button>
              ))}
            </div>
            {templates.length > 0 ? (
              <select className="rounded-md border border-ink/20 bg-white px-3 py-2 text-sm" value={appliedTemplateId} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">Из шаблона…</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            ) : null}
          </div>

          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название задачи *" className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание" rows={2} className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />

          {/* Куда: номер / зона / административная (§4.1) */}
          <div className="space-y-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block text-sm text-dark-gray">Объект</span>
                <select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setRoomId(''); setZoneId(''); }} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
                  {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
              <div>
                <span className="mb-1 block text-sm text-dark-gray">Тип</span>
                <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm">
                  {([['room', 'Номер'], ['zone', 'Зона'], ['admin', 'Административная']] as const).map(([v, l]) => (
                    <button
                      key={v} type="button"
                      disabled={v === 'admin' && kind === 'CLEANING'}
                      onClick={() => { setTargetType(v); if (v !== 'room') setRoomId(''); if (v !== 'zone') setZoneId(''); }}
                      className={`rounded-md px-3 py-1 transition disabled:opacity-40 ${targetType === v ? 'bg-white font-medium text-ink shadow-sm' : 'text-slate-500'}`}
                    >{l}</button>
                  ))}
                </div>
              </div>
            </div>
            {targetType === 'room' ? (
              <label className="block"><span className="mb-1 block text-sm text-dark-gray">Номер</span>
                <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
                  <option value="">—</option>
                  {propRooms.map((r) => <option key={r.id} value={r.id}>№{r.number}</option>)}
                </select>
              </label>
            ) : targetType === 'zone' ? (
              <label className="block"><span className="mb-1 block text-sm text-dark-gray">Зона</span>
                <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
                  <option value="">—</option>
                  {propZones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                </select>
              </label>
            ) : (
              <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">Административная задача — без привязки к номеру или зоне (например, «подготовить отчёт», «заказать канцелярию»).</p>
            )}
          </div>

          {kind === 'CLEANING' ? (
            <label className="block"><span className="mb-1 block text-sm text-dark-gray">Тип уборки</span>
              <select value={cleaningTypeId} onChange={(e) => setCleaningTypeId(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
                <option value="">—</option>
                {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
          ) : null}

          {/* Исполнитель: Сотрудник или Отдел */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-dark-gray">Исполнитель <span className="text-rose-500">*</span></span>
              <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5 text-xs">
                <button type="button" onClick={() => setAssigneeMode('person')} className={`rounded-md px-2.5 py-1 transition ${assigneeMode === 'person' ? 'bg-white font-medium text-ink shadow-sm' : 'text-slate-500'}`}>Сотрудник</button>
                {groups.length > 0 ? <button type="button" onClick={() => setAssigneeMode('group')} className={`rounded-md px-2.5 py-1 transition ${assigneeMode === 'group' ? 'bg-white font-medium text-ink shadow-sm' : 'text-slate-500'}`}>Отдел</button> : null}
              </div>
            </div>
            {assigneeMode === 'person' ? (
              <PersonPicker staff={staff} selected={assigneeIds} onToggle={(id) => toggleArr(assigneeIds, setAssigneeIds, id)} />
            ) : (
              <div className="flex flex-wrap gap-2">
                {groups.map((g) => (
                  <button
                    key={g.id} type="button"
                    onClick={() => setAssigneeGroupId(assigneeGroupId === g.id ? '' : g.id)}
                    className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition ${assigneeGroupId === g.id ? 'border-transparent shadow-sm text-white' : 'border-ink/15 text-slate-600 hover:border-ink/30'}`}
                    style={assigneeGroupId === g.id ? { backgroundColor: g.color } : {}}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />
                    {g.name}
                    <span className="text-xs opacity-60">({g.members.length})</span>
                  </button>
                ))}
                {groups.length === 0 ? <p className="text-xs text-slate-400">Отделов нет — создайте в Настройках → Отделы.</p> : null}
              </div>
            )}
            {!hasAssignee ? <p className="mt-1 text-xs text-amber-600">Выберите сотрудника или отдел</p> : null}
          </div>

          {/* Наблюдатели */}
          <div>
            <p className="mb-1 text-sm text-dark-gray">Наблюдатели</p>
            <PersonPicker staff={staff} selected={watcherIds} onToggle={(id) => toggleArr(watcherIds, setWatcherIds, id)} placeholder="Добавить наблюдателя…" />
          </div>

          {/* Теги: поиск (тегов много после импорта) + выбор + создание прямо здесь */}
          <div>
            <p className="mb-1 text-sm text-dark-gray">Теги</p>
            {localTags.length > 8 ? (
              <input value={tagSearch} onChange={(e) => setTagSearch(e.target.value)} placeholder="Поиск по тегам…" className="mb-2 w-full rounded-md border border-ink/20 px-3 py-1.5 text-sm" />
            ) : null}
            <div className="mb-2 flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
              {localTags.length === 0 ? <p className="text-xs text-slate-400">Нет тегов — создайте ниже</p> : visibleTags.map((t) => (
                <button
                  key={t.id} type="button"
                  onClick={() => toggleArr(tagIds, setTagIds, t.id)}
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition ${tagIds.includes(t.id) ? 'border-transparent' : 'border-ink/15 text-slate-500 hover:border-ink/30'}`}
                  style={tagIds.includes(t.id) ? { backgroundColor: `${t.color}22`, color: t.color, borderColor: t.color } : { borderColor: `${t.color}66`, color: t.color }}
                >{t.name}</button>
              ))}
              {localTags.length > 0 && visibleTags.length === 0 ? <p className="text-xs text-slate-400">Ничего не найдено — можно создать ниже</p> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void createTag(); } }} placeholder="Новый тег…" className="w-40 rounded-md border border-ink/20 px-3 py-1.5 text-sm" />
              <div className="flex items-center gap-1">
                {TAG_PALETTE.map((c) => (
                  <button
                    key={c} type="button" title={c} onClick={() => setNewTagColor(c)}
                    className={`h-5 w-5 rounded-full transition ${newTagColor === c ? 'ring-2 ring-offset-1 ring-ink/40 scale-110' : 'hover:scale-110'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input type="color" value={newTagColor} onChange={(e) => setNewTagColor(e.target.value)} title="Свой цвет" className="h-6 w-7 cursor-pointer rounded-md border border-ink/15 bg-transparent p-0.5" />
              </div>
              <Button variant="secondary" disabled={!newTag.trim()} onClick={() => void createTag()}>＋ Тег</Button>
            </div>
          </div>

          {/* Чек-листы */}
          <div>
            <p className="mb-1 text-sm text-dark-gray">Чек-листы</p>
            <div className="flex flex-wrap gap-1.5">
              {checklists.length === 0 ? <p className="text-xs text-slate-400">—</p> : checklists.map((c) => (
                <button key={c.id} type="button" onClick={() => toggleArr(checklistIds, setChecklistIds, c.id)} className={`rounded-full border px-2.5 py-1 text-xs transition ${checklistIds.includes(c.id) ? 'border-primary bg-primary-100 text-primary-700' : 'border-ink/15 text-slate-500 hover:border-ink/30'}`}>{c.name}</button>
              ))}
            </div>
          </div>

          {mode === 'task' ? (
            <>
              {/* Фото, видео и файлы (§4.1) */}
              <div>
                <p className="mb-1 text-sm text-dark-gray">Фото, видео и файлы</p>
                <input
                  type="file" multiple accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }}
                  className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:text-ink hover:file:bg-slate-200"
                />
                {files.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {files.map((f, idx) => (
                      <span key={idx} className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                        {f.name}
                        <button type="button" onClick={() => setFiles(files.filter((_, i) => i !== idx))} className="text-slate-400 hover:text-rose-600">×</button>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Сроки — календарь в стиле проекта */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div><span className="mb-1 block text-sm text-dark-gray">Срок выполнения</span><DateTimeField value={dueAt} onChange={setDueAt} /></div>
                <div><span className="mb-1 block text-sm text-dark-gray">Принять до</span><DateTimeField value={acceptBy} onChange={setAcceptBy} /></div>
                <div><span className="mb-1 block text-sm text-dark-gray">Запланировать на</span><DateTimeField value={scheduledAt} onChange={setScheduledAt} /></div>
              </div>
              <p className="text-[11px] text-slate-400">Если сроки не заданы, для заявок они проставятся автоматически по SLA-матрице (критичность × источник).</p>
            </>
          ) : (
            /* Повторяемость (планировщик §4.7): частота, время создания, дни, интервал, начало. */
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-3 space-y-2.5">
              <p className="text-sm font-medium text-indigo-700">Повторяемость</p>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <p className="mb-1 text-xs text-slate-500">Частота</p>
                  <select value={freq} onChange={(e) => { setFreq(e.target.value as typeof freq); setDays([]); }} className="rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
                    <option value="DAILY">Ежедневно</option>
                    <option value="WEEKLY">Еженедельно</option>
                    <option value="MONTHLY">Ежемесячно</option>
                    <option value="INTERVAL">Каждые N дней</option>
                  </select>
                </div>
                <div>
                  <p className="mb-1 text-xs text-slate-500">Время создания задачи</p>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-md border border-ink/20 bg-white px-3 py-2 text-sm" />
                </div>
                {freq === 'INTERVAL' ? (
                  <div>
                    <p className="mb-1 text-xs text-slate-500">Интервал (дней)</p>
                    <input type="number" min={1} value={intervalDays} onChange={(e) => setIntervalDays(e.target.value)} className="w-24 rounded-md border border-ink/20 bg-white px-3 py-2 text-sm" />
                  </div>
                ) : null}
                <div>
                  <p className="mb-1 text-xs text-slate-500">Начало действия</p>
                  <DatePicker value={startDate} onChange={setStartDate} placeholder="Сразу" className="w-36" />
                </div>
              </div>
              {freq === 'WEEKLY' ? (
                <div className="flex gap-1">
                  {WEEK.map((w, i) => (
                    <button key={w} type="button" onClick={() => setDays((d) => d.includes(i + 1) ? d.filter((x) => x !== i + 1) : [...d, i + 1])} className={`rounded-md border px-2 py-1 text-xs ${days.includes(i + 1) ? 'border-primary bg-primary-100 text-primary-700' : 'border-ink/15 bg-white text-slate-500'}`}>{w}</button>
                  ))}
                </div>
              ) : null}
              {freq === 'MONTHLY' ? (
                <input
                  placeholder="Числа месяца: 1, 15" defaultValue={days.join(', ')}
                  onChange={(e) => setDays(e.target.value.split(',').map((x) => Number(x.trim())).filter((x) => x >= 1 && x <= 31))}
                  className="w-40 rounded-md border border-ink/20 bg-white px-3 py-1.5 text-sm"
                />
              ) : null}
              {!scheduleOk ? <p className="text-xs text-amber-600">{freq === 'WEEKLY' ? 'Выберите дни недели' : freq === 'MONTHLY' ? 'Укажите числа месяца' : 'Укажите интервал'}</p> : null}
            </div>
          )}

          {/* Доп. флаги */}
          <div className="flex flex-wrap items-center gap-4 text-sm text-dark-gray">
            <label className="flex items-center gap-1.5 cursor-pointer" title="LQA: жёсткие SLA-сроки, перед закрытием — подтверждение гостю"><input type="checkbox" checked={guestRequest} onChange={(e) => setGuestRequest(e.target.checked)} />Заявка гостя</label>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={requirePhotoResult} onChange={(e) => setRequirePhotoResult(e.target.checked)} />Фото результата</label>
            <label className="flex items-center gap-1.5 cursor-pointer" title="«Готово» уйдёт установщику на подтверждение, а не завершит задачу сразу"><input type="checkbox" checked={requireConfirmation} onChange={(e) => setRequireConfirmation(e.target.checked)} />Подтверждение установщиком</label>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={blocksSale} onChange={(e) => setBlocksSale(e.target.checked)} disabled={!roomId} />Ремонт (снять с продажи)</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
              {Object.entries(SEVERITY_RU).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>Отмена</Button>
            <Button disabled={!canSubmit} onClick={submit}>
              {mode === 'recurring' ? (editRule ? 'Сохранить правило' : 'Создать правило') : scheduledAt ? 'Запланировать' : 'Создать'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
