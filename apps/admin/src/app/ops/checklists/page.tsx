'use client';

import { useEffect, useState } from 'react';
import { Button, Card } from '@dha/ui';
import { adminApi, type OpsChecklist, type OpsSnapshotItem } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

type Row = { kind: 'HEADER' | 'ITEM' | 'SUBITEM'; text: string; thirdOption: string; requirePhoto: boolean; excludeFromScore: boolean };

const emptyRow = (kind: Row['kind'] = 'ITEM'): Row => ({ kind, text: '', thirdOption: '', requirePhoto: false, excludeFromScore: false });

/** Конструктор чек-листов (§5.1): заголовки → пункты → подпункты, доп. вариант, фото. */
export default function ChecklistsPage() {
  const ready = useRequireAdmin();
  const [lists, setLists] = useState<OpsChecklist[]>([]);
  const [editing, setEditing] = useState<{ id?: string; name: string; rows: Row[] } | null>(null);
  const [error, setError] = useState('');

  const load = () => adminApi.opsChecklists().then(setLists).catch(() => undefined);
  useEffect(() => { if (ready) void load(); }, [ready]);

  const startEdit = (cl?: OpsChecklist) => {
    if (!cl) { setEditing({ name: '', rows: [emptyRow()] }); return; }
    const items = [...(cl.items as unknown as (OpsSnapshotItem & { parentId: string | null })[])].sort((a, b) => a.order - b.order);
    setEditing({
      id: cl.id,
      name: cl.name,
      rows: items.map((i) => ({ kind: i.kind, text: i.text, thirdOption: i.thirdOption ?? '', requirePhoto: i.requirePhoto, excludeFromScore: i.excludeFromScore })),
    });
  };

  const save = () => {
    if (!editing) return;
    setError('');
    // parentIndex: подпункт цепляется к ближайшему пункту выше (§5.1).
    let lastItemIdx: number | null = null;
    const items = editing.rows.filter((r) => r.text.trim()).map((r, idx) => {
      if (r.kind === 'ITEM') lastItemIdx = idx;
      return {
        kind: r.kind, text: r.text.trim(), thirdOption: r.thirdOption.trim() || undefined,
        requirePhoto: r.requirePhoto, excludeFromScore: r.excludeFromScore,
        parentIndex: r.kind === 'SUBITEM' ? lastItemIdx : null,
      };
    });
    void adminApi.opsSaveChecklist({ name: editing.name.trim(), items }, editing.id)
      .then(() => { setEditing(null); void load(); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  };

  const setRow = (idx: number, patch: Partial<Row>) => setEditing((e) => e && ({ ...e, rows: e.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)) }));
  const move = (idx: number, dir: -1 | 1) => setEditing((e) => {
    if (!e) return e;
    const rows = [...e.rows];
    const j = idx + dir;
    if (j < 0 || j >= rows.length) return e;
    [rows[idx], rows[j]] = [rows[j]!, rows[idx]!];
    return { ...e, rows };
  });

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-3xl font-light text-ink">Операции · Чек-листы</h1>
        <Button onClick={() => startEdit()}>Создать чек-лист</Button>
      </div>
      <p className="mb-6 text-sm text-dark-gray">Прикрепляются к задачам и типам уборок; задача не закроется, пока чек-лист не завершён (§5).</p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {lists.map((cl) => (
          <Card key={cl.id}>
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="font-medium text-ink">{cl.name}</p>
              <div className="flex gap-2 text-sm">
                <button type="button" className="text-primary-700 hover:underline" onClick={() => startEdit(cl)}>Изменить</button>
                <button type="button" className="text-rose-500 hover:underline" onClick={() => { if (confirm('Архивировать чек-лист?')) void adminApi.opsArchiveChecklist(cl.id).then(load); }}>В архив</button>
              </div>
            </div>
            <p className="text-xs text-slate-400">{(cl.items as unknown as OpsSnapshotItem[]).filter((i) => i.kind !== 'HEADER').length} пунктов</p>
          </Card>
        ))}
        {lists.length === 0 ? <p className="text-sm text-dark-gray">Чек-листов пока нет.</p> : null}
      </div>

      {editing ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4" onClick={() => setEditing(null)}>
          <div className="my-4 w-full max-w-3xl rounded-xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
              <h2 className="text-lg font-semibold text-ink">{editing.id ? 'Чек-лист' : 'Новый чек-лист'}</h2>
              <button type="button" onClick={() => setEditing(null)} className="text-2xl leading-none text-slate-400 hover:text-ink">×</button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <input value={editing.name} onChange={(e) => setEditing((s) => s && { ...s, name: e.target.value })} placeholder="Название (напр. «Инспекция номера»)" className="w-full rounded-md border border-ink/20 px-3 py-2 text-sm" />
              <div className="space-y-1.5">
                {editing.rows.map((r, idx) => (
                  <div key={idx} className={`flex flex-wrap items-center gap-2 rounded-lg border border-ink/10 px-2 py-1.5 ${r.kind === 'SUBITEM' ? 'ml-8' : r.kind === 'HEADER' ? 'bg-slate-50' : ''}`}>
                    <select value={r.kind} onChange={(e) => setRow(idx, { kind: e.target.value as Row['kind'] })} className="rounded-md border border-ink/15 px-1.5 py-1 text-xs">
                      <option value="HEADER">Заголовок</option>
                      <option value="ITEM">Пункт</option>
                      <option value="SUBITEM">Подпункт</option>
                    </select>
                    <input value={r.text} onChange={(e) => setRow(idx, { text: e.target.value })} placeholder="Текст…" className={`min-w-0 flex-1 rounded-md border border-ink/15 px-2 py-1 text-sm ${r.kind === 'HEADER' ? 'font-semibold' : ''}`} />
                    {r.kind !== 'HEADER' ? (
                      <>
                        <input value={r.thirdOption} onChange={(e) => setRow(idx, { thirdOption: e.target.value })} placeholder="Доп. вариант (N/A)" className="w-28 rounded-md border border-ink/15 px-2 py-1 text-xs" />
                        <label className="flex items-center gap-1 text-xs text-dark-gray" title="Обязательное фото при любом ответе"><input type="checkbox" checked={r.requirePhoto} onChange={(e) => setRow(idx, { requirePhoto: e.target.checked })} />фото</label>
                        <label className="flex items-center gap-1 text-xs text-dark-gray" title="Не влияет на процент выполнения"><input type="checkbox" checked={r.excludeFromScore} onChange={(e) => setRow(idx, { excludeFromScore: e.target.checked })} />вне %</label>
                      </>
                    ) : null}
                    <div className="flex gap-0.5 text-slate-400">
                      <button type="button" onClick={() => move(idx, -1)} className="hover:text-ink">↑</button>
                      <button type="button" onClick={() => move(idx, 1)} className="hover:text-ink">↓</button>
                      <button type="button" onClick={() => setEditing((e) => e && ({ ...e, rows: e.rows.filter((_, i) => i !== idx) }))} className="hover:text-rose-600">×</button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditing((e) => e && ({ ...e, rows: [...e.rows, emptyRow('HEADER')] }))}>+ Заголовок</Button>
                <Button variant="secondary" onClick={() => setEditing((e) => e && ({ ...e, rows: [...e.rows, emptyRow('ITEM')] }))}>+ Пункт</Button>
                <Button variant="secondary" onClick={() => setEditing((e) => e && ({ ...e, rows: [...e.rows, emptyRow('SUBITEM')] }))}>+ Подпункт</Button>
              </div>
              {error ? <p className="text-sm text-rose-600">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setEditing(null)}>Отмена</Button>
                <Button disabled={!editing.name.trim() || editing.rows.every((r) => !r.text.trim())} onClick={save}>Сохранить</Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
