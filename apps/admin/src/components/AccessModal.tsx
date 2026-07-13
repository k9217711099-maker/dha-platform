'use client';

import { useEffect, useState } from 'react';
import { Button } from '@dha/ui';
import { adminApi, type AclEntryInput, type AclLevelKey, type AclResourceType, type AclSubjectsCatalog } from '../lib/api';

const LEVELS: { value: AclLevelKey; label: string }[] = [
  { value: 'VIEWER', label: 'Просмотр' },
  { value: 'EDITOR', label: 'Редактирование' },
  { value: 'MANAGER', label: 'Управление' },
];

/**
 * Модал «Доступы» — гранты на объект БЗ/Диска (KB-DRIVE-TZ.md §2).
 * Семантика: без грантов объект доступен всем с правами раздела; появился хотя бы
 * один грант — объект видят только перечисленные (вложенное наследует).
 */
export function AccessModal({
  resourceType,
  resourceId,
  title,
  onClose,
}: {
  resourceType: AclResourceType;
  resourceId: string;
  title: string;
  onClose: (changed: boolean) => void;
}) {
  const [subjects, setSubjects] = useState<AclSubjectsCatalog | null>(null);
  const [entries, setEntries] = useState<AclEntryInput[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([adminApi.aclSubjects(), adminApi.aclList(resourceType, resourceId)])
      .then(([subj, list]) => {
        setSubjects(subj);
        setEntries(list.map((e) => ({ subjectType: e.subjectType, subjectId: e.subjectId, level: e.level })));
      })
      .catch((e) => setError((e as Error).message));
  }, [resourceType, resourceId]);

  const subjectOptions = (type: AclEntryInput['subjectType']) => {
    if (!subjects) return [];
    if (type === 'user') return subjects.users.map((u) => ({ value: u.id, label: u.name ? `${u.name} (${u.email})` : u.email }));
    if (type === 'role') return subjects.roles.map((r) => ({ value: r.key, label: r.name }));
    return subjects.groups.map((g) => ({ value: g.id, label: g.name }));
  };

  const set = (i: number, patch: Partial<AclEntryInput>) =>
    setEntries((prev) => prev.map((e, j) => {
      if (j !== i) return e;
      const next = { ...e, ...patch };
      if (patch.subjectType) next.subjectId = subjectOptions(patch.subjectType)[0]?.value ?? '';
      return next;
    }));

  async function save() {
    setBusy(true);
    setError('');
    try {
      await adminApi.aclSet(resourceType, resourceId, entries.filter((e) => e.subjectId));
      onClose(true);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => onClose(false)}>
      <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <p className="mb-1 text-lg text-ink">Доступы: {title}</p>
        <p className="mb-3 text-xs text-neutral-500">
          Пока грантов нет — объект видят все сотрудники с правами раздела. Добавьте гранты — и объект
          (со всем вложенным) останется доступен только перечисленным. Уровни: просмотр → редактирование → управление.
        </p>
        {error && <p className="mb-2 rounded bg-red-50 px-2 py-1 text-sm text-red-700">{error}</p>}
        {!subjects && !error && <p className="text-sm text-dark-gray">Загрузка…</p>}
        {subjects && (
          <>
            <div className="mb-3 space-y-2">
              {entries.length === 0 && <p className="text-sm text-dark-gray">Грантов нет — доступ по общим правам раздела.</p>}
              {entries.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={e.subjectType} onChange={(ev) => set(i, { subjectType: ev.target.value as AclEntryInput['subjectType'] })} className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
                    <option value="role">Роль</option>
                    <option value="user">Сотрудник</option>
                    <option value="group">Группа</option>
                  </select>
                  <select value={e.subjectId} onChange={(ev) => set(i, { subjectId: ev.target.value })} className="min-w-0 grow rounded border border-neutral-300 px-2 py-1.5 text-sm">
                    <option value="">— выберите —</option>
                    {subjectOptions(e.subjectType).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <select value={e.level} onChange={(ev) => set(i, { level: ev.target.value as AclLevelKey })} className="rounded border border-neutral-300 px-2 py-1.5 text-sm">
                    {LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                  <button className="text-red-500 hover:text-red-700" title="Убрать" onClick={() => setEntries((prev) => prev.filter((_, j) => j !== i))}>✕</button>
                </div>
              ))}
            </div>
            <button
              className="mb-4 rounded border border-dashed border-neutral-300 px-3 py-1.5 text-sm text-neutral-600 hover:bg-neutral-50"
              onClick={() => setEntries((prev) => [...prev, { subjectType: 'role', subjectId: '', level: 'VIEWER' }])}
            >
              + Добавить грант
            </button>
            <div className="flex justify-end gap-2">
              <button className="rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100" onClick={() => onClose(false)}>Отмена</button>
              <Button onClick={() => void save()} disabled={busy}>{busy ? 'Сохранение…' : 'Сохранить'}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
