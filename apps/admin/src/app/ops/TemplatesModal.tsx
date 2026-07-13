'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@dha/ui';
import {
  adminApi, type OpsChecklist, type OpsGroup, type OpsStaff, type OpsTag, type OpsTemplate,
} from '../../lib/api';
import { PersonPicker, TAG_PALETTE } from './CreateTaskModal';
import { SEVERITY_RU } from './shared';

/** Типизированный payload шаблона (поля TeamJet §4.5 + офсеты сроков). */
export interface TplPayload {
  title?: string;
  description?: string;
  groupId?: string;
  assigneeIds?: string[];
  watcherIds?: string[];
  important?: boolean;
  severity?: string;
  dueOffsetMinutes?: number;
  acceptOffsetMinutes?: number;
  tagIds?: string[];
  checklistIds?: string[];
  guestRequest?: boolean;
  requirePhotoResult?: boolean;
  requireConfirmation?: boolean;
}

/** «+30 мин» из офсета. */
export function fmtOffset(min?: number): string {
  if (!min) return 'Любое время';
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  return `+${d ? `${d}д ` : ''}${h ? `${h}ч ` : ''}${m ? `${m}мин` : ''}`.trim();
}

/** Окно «Шаблоны» (TeamJet): таблица с фильтрами, импорт CSV/Excel, создание/правка. */
export function TemplatesModal({ staff, groups, tags, checklists, canManage, onClose, onUseTemplate }: {
  staff: OpsStaff[];
  groups: OpsGroup[];
  tags: OpsTag[];
  checklists: OpsChecklist[];
  canManage: boolean;
  onClose: () => void;
  /** «Создать задачу» из строки шаблона: закрыть окно и открыть форму задачи с шаблоном. */
  onUseTemplate: (tpl: OpsTemplate) => void;
}) {
  const [templates, setTemplates] = useState<OpsTemplate[]>([]);
  const [groupF, setGroupF] = useState('');
  const [tagF, setTagF] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<OpsTemplate | null | 'new'>(null);
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => adminApi.opsTemplates().then(setTemplates).catch(() => undefined);
  useEffect(() => { void load(); }, []);

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const tagById = useMemo(() => new Map(tags.map((t) => [t.id, t])), [tags]);
  const clById = useMemo(() => new Map(checklists.map((c) => [c.id, c])), [checklists]);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const filtered = templates.filter((t) => {
    const p = t.payload as TplPayload;
    if (groupF && p.groupId !== groupF) return false;
    if (tagF && !(p.tagIds ?? []).includes(tagF)) return false;
    if (q && !t.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const doImport = async (file: File) => {
    setImportMsg('Импорт…');
    try {
      const r = await adminApi.opsImportTemplates(file);
      setImportMsg(`Импортировано: ${r.created} новых, ${r.updated} обновлено${r.createdTags ? `, тегов +${r.createdTags}` : ''}${r.createdGroups ? `, отделов +${r.createdGroups}` : ''}`);
      void load();
    } catch (e) {
      setImportMsg(e instanceof Error ? e.message : 'Ошибка импорта');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={onClose}>
      <div className="my-4 w-full max-w-5xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <h2 className="text-lg font-semibold text-ink">Шаблоны</h2>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-slate-400 hover:text-ink">×</button>
        </div>

        <div className="px-5 py-4">
          {/* Фильтры + импорт + создание (как в TeamJet) */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select value={groupF} onChange={(e) => setGroupF(e.target.value)} className="rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
              <option value="">Выберите группу исполнителя</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select value={tagF} onChange={(e) => setTagF(e.target.value)} className="rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
              <option value="">Выберите теги</option>
              {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск" className="w-44 rounded-md border border-ink/20 px-3 py-2 text-sm" />
            <span className="ml-auto" />
            {canManage ? (
              <>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
                <Button variant="secondary" onClick={() => fileRef.current?.click()} title="Импорт шаблонов из CSV/Excel (Задача;Исполнители;Наблюдатель;Приоритет;Срок;Где;Теги)">⇪ Импорт</Button>
                <Button onClick={() => setEditing('new')}>Создать шаблон</Button>
              </>
            ) : null}
          </div>
          {importMsg ? <p className="mb-2 text-xs text-indigo-600">{importMsg}</p> : null}

          <div className="overflow-x-auto rounded-lg border border-ink/10">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-ink/10 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2.5 pl-4 pr-3">Текст задачи</th>
                  <th className="py-2.5 pr-3">Исполнитель</th>
                  <th className="py-2.5 pr-3">Наблюдатель</th>
                  <th className="py-2.5 pr-3">Приоритет</th>
                  <th className="py-2.5 pr-3">Чек-лист</th>
                  <th className="py-2.5 pr-3">Срок</th>
                  <th className="py-2.5 pr-3">Теги</th>
                  <th className="py-2.5 pr-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? <tr><td colSpan={8} className="py-8 text-center text-sm text-slate-400">Шаблонов нет — создайте или импортируйте из файла.</td></tr> : null}
                {filtered.map((t) => {
                  const p = t.payload as TplPayload;
                  const g = p.groupId ? groupById.get(p.groupId) : null;
                  const watcher = p.watcherIds?.[0] ? staffById.get(p.watcherIds[0]) : null;
                  return (
                    <tr key={t.id} className="group border-b border-ink/5 hover:bg-slate-50 cursor-pointer" onClick={() => onUseTemplate(t)} title="Создать задачу из шаблона">
                      <td className="py-2.5 pl-4 pr-3 font-medium text-ink">{t.name}</td>
                      <td className="py-2.5 pr-3">
                        {g ? <span className="inline-flex items-center gap-1.5 text-xs text-ink"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />{g.name}</span>
                          : p.assigneeIds?.length ? <span className="text-xs text-ink">{p.assigneeIds.map((id) => staffById.get(id)?.name ?? '—').join(', ')}</span>
                          : <span className="text-xs text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-ink">{watcher ? (watcher.name ?? watcher.email) : <span className="text-slate-300">—</span>}</td>
                      <td className="py-2.5 pr-3 text-xs">
                        {p.important ? <span className="text-amber-600 font-medium">Важно</span> : null}
                        {p.severity && p.severity !== 'MINOR' ? <span className="ml-1 text-rose-500">{SEVERITY_RU[p.severity as 'MAJOR'] ?? p.severity}</span> : null}
                        {p.guestRequest ? <span className="ml-1 rounded bg-violet-100 px-1 py-0.5 text-[10px] text-violet-700">гость</span> : null}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-ink">{(p.checklistIds ?? []).map((id) => clById.get(id)?.name).filter(Boolean).join(', ') || <span className="text-slate-300">—</span>}</td>
                      <td className="py-2.5 pr-3 text-xs text-ink">{p.dueOffsetMinutes ? fmtOffset(p.dueOffsetMinutes) : <span className="text-slate-300">—</span>}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex max-w-[220px] flex-wrap gap-1">
                          {(p.tagIds ?? []).map((id) => {
                            const tag = tagById.get(id);
                            return tag ? <span key={id} className="rounded-full px-1.5 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${tag.color}22`, color: tag.color }}>{tag.name}</span> : null;
                          })}
                        </div>
                      </td>
                      <td className="py-2.5 pr-3">
                        {canManage ? (
                          <div className="hidden items-center gap-1.5 group-hover:flex" onClick={(e) => e.stopPropagation()}>
                            <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => setEditing(t)}>Изменить</button>
                            <button type="button" className="text-xs text-rose-500 hover:underline" onClick={() => { if (confirm(`Удалить шаблон «${t.name}»?`)) void adminApi.opsDeleteTemplate(t.id).then(load); }}>Удалить</button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-400">Клик по строке — создать задачу из шаблона. Всего: {filtered.length}</p>
        </div>
      </div>

      {editing ? (
        <TemplateForm
          template={editing === 'new' ? null : editing}
          staff={staff} groups={groups} tags={tags} checklists={checklists}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void load(); }}
        />
      ) : null}
    </div>
  );
}

/** Форма создания/правки шаблона: все поля TeamJet (отдел, наблюдатели, приоритет, срок-офсет, теги, чек-лист). */
function TemplateForm({ template, staff, groups, tags, checklists, onClose, onSaved }: {
  template: OpsTemplate | null;
  staff: OpsStaff[]; groups: OpsGroup[]; tags: OpsTag[]; checklists: OpsChecklist[];
  onClose: () => void; onSaved: () => void;
}) {
  const p = (template?.payload ?? {}) as TplPayload;
  const [title, setTitle] = useState(p.title ?? template?.name ?? '');
  const [description, setDescription] = useState(p.description ?? '');
  const [groupId, setGroupId] = useState(p.groupId ?? '');
  const [watcherIds, setWatcherIds] = useState<string[]>(p.watcherIds ?? []);
  const [important, setImportant] = useState(Boolean(p.important));
  const [severity, setSeverity] = useState(p.severity ?? 'MINOR');
  const [guestRequest, setGuestRequest] = useState(Boolean(p.guestRequest));
  const [requirePhotoResult, setRequirePhotoResult] = useState(Boolean(p.requirePhotoResult));
  const [requireConfirmation, setRequireConfirmation] = useState(Boolean(p.requireConfirmation));
  const [dueOffset, setDueOffset] = useState(p.dueOffsetMinutes ? String(p.dueOffsetMinutes) : '');
  const [tagIds, setTagIds] = useState<string[]>(p.tagIds ?? []);
  const [checklistIds, setChecklistIds] = useState<string[]>(p.checklistIds ?? []);
  const [newTag, setNewTag] = useState('');
  const [newTagColor, setNewTagColor] = useState<string>(TAG_PALETTE[0] ?? '#6366f1');
  const [localTags, setLocalTags] = useState<OpsTag[]>(tags);
  const [error, setError] = useState('');

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  const createTag = async () => {
    if (!newTag.trim()) return;
    const t = await adminApi.opsCreateTag({ name: newTag.trim(), color: newTagColor }).catch(() => null);
    if (t) { setLocalTags((x) => [...x, t]); setTagIds((x) => [...x, t.id]); setNewTag(''); }
  };

  const save = async () => {
    setError('');
    const payload: TplPayload & { kind: string } = {
      kind: 'TASK', title: title.trim(),
      description: description.trim() || undefined,
      groupId: groupId || undefined,
      watcherIds: watcherIds.length ? watcherIds : undefined,
      important: important || undefined,
      severity: severity !== 'MINOR' ? severity : undefined,
      guestRequest: guestRequest || undefined,
      requirePhotoResult: requirePhotoResult || undefined,
      requireConfirmation: requireConfirmation || undefined,
      dueOffsetMinutes: dueOffset ? Number(dueOffset) : undefined,
      tagIds: tagIds.length ? tagIds : undefined,
      checklistIds: checklistIds.length ? checklistIds : undefined,
    };
    try {
      await adminApi.opsSaveTemplate({ name: title.trim(), payload: payload as unknown as Record<string, unknown> }, template?.id);
      onSaved();
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={onClose}>
      <div className="my-6 w-full max-w-xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
          <h3 className="text-base font-semibold text-ink">{template ? 'Шаблон — правка' : 'Новый шаблон'}</h3>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-slate-400 hover:text-ink">×</button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Текст задачи *" className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Описание" rows={2} className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />

          <div>
            <p className="mb-1 text-sm text-dark-gray">Исполнитель (отдел)</p>
            <div className="flex flex-wrap gap-1.5">
              {groups.map((g) => (
                <button key={g.id} type="button" onClick={() => setGroupId(groupId === g.id ? '' : g.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${groupId === g.id ? 'border-transparent text-white shadow-sm' : 'border-ink/15 text-slate-600'}`}
                  style={groupId === g.id ? { backgroundColor: g.color } : {}}>
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />{g.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm text-dark-gray">Наблюдатели</p>
            <PersonPicker staff={staff} selected={watcherIds} onToggle={(id) => toggle(watcherIds, setWatcherIds, id)} placeholder="Добавить наблюдателя…" />
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm text-dark-gray">
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />Важно</label>
            <label className="flex items-center gap-1.5 cursor-pointer" title="LQA: SLA-сроки гостевых заявок, callback перед закрытием"><input type="checkbox" checked={guestRequest} onChange={(e) => setGuestRequest(e.target.checked)} />Заявка гостя</label>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={requirePhotoResult} onChange={(e) => setRequirePhotoResult(e.target.checked)} />Фото результата</label>
            <label className="flex items-center gap-1.5 cursor-pointer"><input type="checkbox" checked={requireConfirmation} onChange={(e) => setRequireConfirmation(e.target.checked)} />Подтверждение</label>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="rounded-md border border-ink/20 bg-white px-2.5 py-1.5 text-sm">
              {Object.entries(SEVERITY_RU).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <label className="flex items-center gap-1.5">Срок: через
              <input type="number" min={0} value={dueOffset} onChange={(e) => setDueOffset(e.target.value)} placeholder="—" className="w-20 rounded-md border border-ink/20 px-2 py-1.5 text-sm" />мин
            </label>
          </div>

          <div>
            <p className="mb-1 text-sm text-dark-gray">Теги</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {localTags.map((t) => (
                <button key={t.id} type="button" onClick={() => toggle(tagIds, setTagIds, t.id)}
                  className="rounded-full border px-2.5 py-0.5 text-xs font-medium transition"
                  style={tagIds.includes(t.id) ? { backgroundColor: `${t.color}22`, color: t.color, borderColor: t.color } : { borderColor: `${t.color}66`, color: t.color }}>{t.name}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void createTag(); } }} placeholder="Новый тег…" className="w-36 rounded-md border border-ink/20 px-3 py-1.5 text-sm" />
              <div className="flex items-center gap-1">
                {TAG_PALETTE.map((c) => (
                  <button key={c} type="button" onClick={() => setNewTagColor(c)} className={`h-4 w-4 rounded-full ${newTagColor === c ? 'ring-2 ring-offset-1 ring-ink/40' : ''}`} style={{ backgroundColor: c }} />
                ))}
              </div>
              <Button variant="secondary" disabled={!newTag.trim()} onClick={() => void createTag()}>＋</Button>
            </div>
          </div>

          <div>
            <p className="mb-1 text-sm text-dark-gray">Чек-лист</p>
            <div className="flex flex-wrap gap-1.5">
              {checklists.map((c) => (
                <button key={c.id} type="button" onClick={() => toggle(checklistIds, setChecklistIds, c.id)} className={`rounded-full border px-2.5 py-1 text-xs transition ${checklistIds.includes(c.id) ? 'border-primary bg-primary-100 text-primary-700' : 'border-ink/15 text-slate-500'}`}>{c.name}</button>
              ))}
              {checklists.length === 0 ? <p className="text-xs text-slate-400">—</p> : null}
            </div>
          </div>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>Отмена</Button>
            <Button disabled={!title.trim()} onClick={() => void save()}>{template ? 'Сохранить' : 'Создать шаблон'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
