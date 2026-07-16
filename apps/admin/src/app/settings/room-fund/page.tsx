'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input } from '@dha/ui';
import {
  adminApi,
  fileUrl,
  type BnovoImportPreview,
  type BnovoImportResult,
  type PmsRoom,
  type PmsRoomOption,
  type RoomFundCategory,
  type RoomFundChangeEntry,
} from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';
import { ObjectsTab } from './ObjectsTab';

type Tab = 'objects' | 'categories' | 'rooms' | 'import' | 'log';
const selectCls = 'w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';

/** Тумблер вкл/выкл. */
function Toggle({ on, onClick, title }: { on: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-ink/20'}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

export default function RoomFundPage() {
  const ready = useRequireAdmin();
  const [tab, setTab] = useState<Tab>('categories');
  const [options, setOptions] = useState<PmsRoomOption[]>([]);
  const [propertyFilter, setPropertyFilter] = useState('');
  const [categories, setCategories] = useState<RoomFundCategory[]>([]);
  const [rooms, setRooms] = useState<PmsRoom[]>([]);
  const [error, setError] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const router = useRouter();

  const goNew = () => router.push(`/settings/room-fund/category/new${propertyFilter ? `?propertyId=${propertyFilter}` : ''}`);
  const goEdit = (c: RoomFundCategory) => router.push(`/settings/room-fund/category/${c.id}`);

  const loadCats = () => adminApi.roomFundCategories().then(setCategories).catch(() => undefined);
  const loadRooms = () => adminApi.pmsRooms({ propertyId: propertyFilter || undefined }).then(setRooms).catch(() => undefined);

  useEffect(() => {
    if (!ready) return;
    void adminApi.pmsRoomOptions().then(setOptions).catch(() => undefined);
    void loadCats();
  }, [ready]);
  useEffect(() => { if (ready) void loadRooms(); }, [ready, propertyFilter]);

  const run = (fn: () => Promise<unknown>, after?: () => void) => {
    setError('');
    void fn().then(() => { after?.(); }).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка'));
  };

  const shownCats = useMemo(
    () => categories.filter((c) => !propertyFilter || c.propertyId === propertyFilter),
    [categories, propertyFilter],
  );
  // Группировка по объекту (корень → категории), порядок sortOrder.
  const catsByProperty = useMemo(() => {
    const map = new Map<string, { name: string; cats: RoomFundCategory[] }>();
    for (const c of [...shownCats].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const g = map.get(c.propertyId) ?? { name: c.property.name, cats: [] };
      g.cats.push(c);
      map.set(c.propertyId, g);
    }
    return [...map.entries()];
  }, [shownCats]);

  const catsOf = (propertyId: string) => categories.filter((c) => c.propertyId === propertyId).sort((a, b) => a.sortOrder - b.sortOrder);

  async function handleDrop(target: RoomFundCategory) {
    const id = dragId;
    setDragId(null);
    if (!id || id === target.id) return;
    const dragged = categories.find((c) => c.id === id);
    if (!dragged || dragged.propertyId !== target.propertyId) return;
    const ids = catsOf(target.propertyId).map((c) => c.id).filter((x) => x !== id);
    ids.splice(ids.indexOf(target.id), 0, id);
    run(() => adminApi.reorderRoomFundCategories({ propertyId: target.propertyId, orderedIds: ids }), loadCats);
  }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Номерной фонд</h1>
      <p className="mb-5 text-sm text-dark-gray">Категории и номера по всем объектам сети. «Добавить категорию» открывает полный редактор карточки.</p>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-ink/5 p-1">
          {([['objects', 'Объекты'], ['categories', 'Категории номеров'], ['rooms', 'Номера'], ['import', 'Импорт из Bnovo'], ['log', 'Журнал изменений']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 text-sm transition ${tab === t ? 'bg-white font-medium text-ink shadow-sm' : 'text-dark-gray hover:text-ink'}`}>
              {label}
            </button>
          ))}
        </div>
        {(tab === 'categories' || tab === 'rooms') && (
          <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} className={`${selectCls} w-auto`}>
            <option value="">Все объекты</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        )}
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {tab === 'objects' && (
        <ObjectsTab onChanged={() => { void adminApi.pmsRoomOptions().then(setOptions).catch(() => undefined); void loadCats(); }} />
      )}

      {tab === 'categories' && (
        <CategoriesTab
          catsByProperty={catsByProperty}
          options={options}
          onAdd={goNew}
          onEdit={goEdit}
          onToggle={(c, patch) => run(() => adminApi.roomFundVisibility(c.id, patch), loadCats)}
          onCopy={(c) => run(() => adminApi.duplicateRoomFundCategory(c.id), loadCats)}
          onDelete={(c) => { if (confirm(`Удалить категорию «${c.name}»?`)) run(() => adminApi.deleteRoomFundCategory(c.id), loadCats); }}
          dragId={dragId} setDragId={setDragId} onDrop={handleDrop}
        />
      )}

      {tab === 'rooms' && (
        <RoomsTab
          options={options}
          categories={categories}
          rooms={rooms}
          defaultProperty={propertyFilter}
          onChanged={loadRooms}
          onError={setError}
        />
      )}

      {tab === 'import' && <BnovoImportTab onImported={() => { void adminApi.pmsRoomOptions().then(setOptions).catch(() => undefined); void loadCats(); void loadRooms(); }} />}

      {tab === 'log' && <ChangelogTab />}
    </main>
  );
}

const DELETE_MODES: { value: 'none' | 'empty' | 'hide' | 'all'; label: string; hint: string }[] = [
  { value: 'none', label: 'Ничего не трогать', hint: 'Только добавить/обновить категории и номера из Bnovo.' },
  { value: 'empty', label: 'Удалить пустые', hint: 'Удалить существующие категории без броней; с бронями — оставить.' },
  { value: 'hide', label: 'Скрыть старые', hint: 'Существующие категории пометить неактивными (данные сохранятся).' },
  { value: 'all', label: 'Удалить все (с бронями)', hint: 'Удалить все существующие категории вместе с их бронями. Необратимо.' },
];

/** Импорт номерного фонда из Bnovo (категории + номера). Идемпотентно по bnovoId. */
function BnovoImportTab({ onImported }: { onImported: () => void }) {
  const [preview, setPreview] = useState<BnovoImportPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'none' | 'empty' | 'hide' | 'all'>('none');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BnovoImportResult | null>(null);
  const [err, setErr] = useState('');

  const load = () => { setLoading(true); setErr(''); void adminApi.bnovoImportPreview().then(setPreview).catch((e) => setErr(e instanceof Error ? e.message : 'Ошибка')).finally(() => setLoading(false)); };
  useEffect(load, []);

  const delBookings = preview?.existing.reduce((s, c) => s + c.bookings, 0) ?? 0;
  const apply = async () => {
    const warn = mode === 'all' && delBookings > 0
      ? `Будут удалены существующие категории и ${delBookings} броней. Действие необратимо. Продолжить?`
      : 'Импортировать категории и номера из Bnovo?';
    if (!confirm(warn)) return;
    setBusy(true); setErr(''); setResult(null);
    try { const r = await adminApi.bnovoImportApply(mode); setResult(r); load(); onImported(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-3xl space-y-4">
      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-light text-ink">Выгрузка из Bnovo</p>
            <p className="text-sm text-dark-gray">Категории (родительские) и физические номера. Повторный запуск обновляет по bnovoId, не создавая дублей.</p>
          </div>
          <Button variant="secondary" onClick={load} disabled={loading}>{loading ? 'Проверка…' : 'Обновить'}</Button>
        </div>

        {loading && !preview ? <p className="text-sm text-dark-gray">Подключение к Bnovo…</p> : null}
        {preview && !preview.reachable ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Bnovo недоступен: {preview.error}</p> : null}
        {preview?.reachable ? (
          <div className="grid grid-cols-3 gap-3 rounded-lg bg-ink/[0.03] p-3 text-sm">
            <div><span className="block text-dark-gray">Объектов</span><span className="text-xl font-medium text-ink">{preview.bnovo.properties}</span></div>
            <div><span className="block text-dark-gray">Категорий</span><span className="text-xl font-medium text-ink">{preview.bnovo.roomTypes}</span></div>
            <div><span className="block text-dark-gray">Номеров</span><span className="text-xl font-medium text-ink">{preview.bnovo.rooms}</span></div>
          </div>
        ) : null}
        {preview?.reachable && preview.bnovo.sampleRoomTypes.length ? (
          <p className="text-xs text-dark-gray">Примеры категорий: {preview.bnovo.sampleRoomTypes.slice(0, 4).map((s) => s.name).join('; ')}…</p>
        ) : null}
      </Card>

      {preview ? (
        <Card className="space-y-3 p-5">
          <p className="text-sm font-medium text-ink">Существующие категории у нас ({preview.existing.length})</p>
          {preview.existing.length === 0 ? <p className="text-sm text-dark-gray">Категорий пока нет.</p> : (
            <div className="max-h-52 overflow-auto rounded-lg border border-ink/10">
              {preview.existing.map((c) => (
                <div key={c.id} className="flex items-center justify-between border-b border-ink/5 px-3 py-1.5 text-sm last:border-0">
                  <span className="truncate text-ink">{c.name} <span className="text-dark-gray">· {c.property}</span></span>
                  <span className="shrink-0 text-xs text-dark-gray">{c.rooms} ном. · {c.bookings} брон.{c.fromBnovo ? ' · Bnovo' : ''}</span>
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">Что сделать с существующими категориями</p>
            <div className="space-y-1.5">
              {DELETE_MODES.map((m) => (
                <label key={m.value} className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 ${mode === m.value ? 'border-ink bg-ink/[0.03]' : 'border-ink/15'} ${m.value === 'all' ? 'hover:border-red-300' : ''}`}>
                  <input type="radio" className="mt-0.5" checked={mode === m.value} onChange={() => setMode(m.value)} />
                  <span><span className={`text-sm font-medium ${m.value === 'all' ? 'text-red-700' : 'text-ink'}`}>{m.label}</span><span className="block text-xs text-dark-gray">{m.hint}</span></span>
                </label>
              ))}
            </div>
          </div>

          {err ? <p className="text-sm text-red-600">{err}</p> : null}
          {result ? (
            <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Импортировано: категорий {result.roomTypes}, номеров {result.rooms}. Удалено категорий {result.deletedCategories} (броней {result.deletedBookings}){result.hiddenCategories ? `, скрыто ${result.hiddenCategories}` : ''}.
              {result.keptCategories.length ? ` Оставлены с бронями: ${result.keptCategories.map((k) => k.name).join(', ')}.` : ''}
            </div>
          ) : null}

          <div>
            <Button onClick={apply} disabled={busy || !preview.reachable}>{busy ? 'Импорт…' : 'Импортировать из Bnovo'}</Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}

// ─────────── Вкладка «Категории номеров» ───────────
function CategoriesTab(props: {
  catsByProperty: [string, { name: string; cats: RoomFundCategory[] }][];
  options: PmsRoomOption[];
  onAdd: () => void;
  onEdit: (c: RoomFundCategory) => void;
  onToggle: (c: RoomFundCategory, patch: { showInBooking?: boolean; showInOta?: boolean }) => void;
  onCopy: (c: RoomFundCategory) => void;
  onDelete: (c: RoomFundCategory) => void;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  onDrop: (c: RoomFundCategory) => void;
}) {
  const { catsByProperty, onAdd, onEdit, onToggle, onCopy, onDelete, dragId, setDragId, onDrop } = props;
  return (
    <div>
      <div className="mb-4"><Button onClick={onAdd}>+ Добавить категорию</Button></div>
      {catsByProperty.length === 0 ? <p className="text-sm text-dark-gray">Категорий нет.</p> : null}
      <div className="space-y-6">
        {catsByProperty.map(([propertyId, group]) => (
          <div key={propertyId}>
            <p className="mb-2 text-sm font-medium text-ink">{group.name} <span className="text-dark-gray">· {group.cats.length}</span></p>
            <div className="overflow-hidden rounded-lg border border-ink/10">
              {group.cats.map((c) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={() => setDragId(c.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDrop(c)}
                  className={`flex items-center gap-3 border-b border-ink/5 bg-white px-3 py-2 text-sm last:border-b-0 ${dragId === c.id ? 'opacity-40' : ''}`}
                >
                  <span className="cursor-grab select-none text-base leading-none text-ink/30" title="Перетащить">⋮⋮</span>
                  <span className="w-14 shrink-0 font-mono text-xs text-dark-gray">{c.shortName || '—'}</span>
                  <span className="flex-1 truncate text-ink">{c.name}{c.typeLabel ? <span className="text-dark-gray"> · {c.typeLabel}</span> : null}</span>
                  <span className="shrink-0 text-xs text-dark-gray" title="Основные + дополнительные места">{c.mainPlaces ?? c.capacity}<span className="text-ink/30">+{c.extraPlaces}</span> мест</span>
                  <span className="shrink-0 text-xs text-dark-gray">{c._count.rooms} ном.</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="flex items-center gap-1 text-[11px] text-dark-gray" title="Показывать в модуле «Бронирования»">Бронир.<Toggle on={c.showInBooking} onClick={() => onToggle(c, { showInBooking: !c.showInBooking })} title="Бронирования" /></span>
                    <span className="flex items-center gap-1 text-[11px] text-dark-gray" title="Выгружать на OTA">OTA<Toggle on={c.showInOta} onClick={() => onToggle(c, { showInOta: !c.showInOta })} title="OTA" /></span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => onEdit(c)} className="rounded px-2 py-1 text-xs text-ink hover:bg-ink/5" title="Редактировать">✎</button>
                    <button type="button" onClick={() => onCopy(c)} className="rounded px-2 py-1 text-xs text-ink hover:bg-ink/5" title="Копировать">⧉</button>
                    <button type="button" onClick={() => onDelete(c)} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50" title="Удалить">🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────── Вкладка «Номера» ───────────
type AddMode = 'single' | 'bulk' | 'batch' | 'instructions';
type BatchRow = { number: string; roomTypeId: string; floor: string; comment: string; excludeFromStats: boolean };

function RoomsTab(props: {
  options: PmsRoomOption[];
  categories: RoomFundCategory[];
  rooms: PmsRoom[];
  defaultProperty: string;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const { options, categories, rooms, defaultProperty, onChanged, onError } = props;
  const [mode, setMode] = useState<AddMode>('single');
  const [propertyId, setPropertyId] = useState(defaultProperty || options[0]?.id || '');
  const [roomTypeId, setRoomTypeId] = useState('');
  const [single, setSingle] = useState({ number: '', floor: '', comment: '', excludeFromStats: false });
  const [bulk, setBulk] = useState({ from: '', to: '', floor: '', comment: '', excludeFromStats: false });
  const [batch, setBatch] = useState<BatchRow[]>([{ number: '', roomTypeId: '', floor: '', comment: '', excludeFromStats: false }]);
  const [editRoom, setEditRoom] = useState<PmsRoom | null>(null);
  const [ef, setEf] = useState({ number: '', floor: '', address: '', roomTypeId: '', comment: '', excludeFromStats: false, active: true, sectionId: '', checkinInstructions: '', checkinPhotos: [] as string[] });
  const [photoUploading, setPhotoUploading] = useState(false);
  // Массовое заполнение инструкций (режим апартаментов): черновик правок по roomId.
  const [instrEdits, setInstrEdits] = useState<Record<string, { address: string; checkinInstructions: string }>>({});
  const [instrSaving, setInstrSaving] = useState(false);
  // Секции уборок (TASKS-HOUSEKEEPING-TZ §7); недоступны без ops-прав — тогда селект скрыт.
  const [sections, setSections] = useState<{ id: string; propertyId: string; name: string }[]>([]);
  useEffect(() => { void adminApi.opsSections().then(setSections).catch(() => undefined); }, []);

  useEffect(() => { if (!propertyId && options[0]) setPropertyId(options[0].id); }, [options, propertyId]);
  const cats = useMemo(() => categories.filter((c) => c.propertyId === propertyId).sort((a, b) => a.sortOrder - b.sortOrder), [categories, propertyId]);
  const editCats = useMemo(() => editRoom ? categories.filter((c) => c.propertyId === editRoom.property.id).sort((a, b) => a.sortOrder - b.sortOrder) : [], [editRoom, categories]);
  useEffect(() => { setRoomTypeId(cats[0]?.id ?? ''); }, [cats]);

  const go = (fn: () => Promise<{ created: number; skipped: string[] }>, reset: () => void) => {
    onError('');
    void fn().then((r) => { reset(); onChanged(); if (r.skipped.length) onError(`Создано: ${r.created}. Пропущены (уже есть): ${r.skipped.join(', ')}`); }).catch((e) => onError(e instanceof Error ? e.message : 'Ошибка'));
  };

  const addSingle = () => {
    if (!roomTypeId || !single.number.trim()) { onError('Выберите категорию и укажите номер'); return; }
    onError('');
    void adminApi.pmsCreateRoom({ propertyId, roomTypeId, number: single.number.trim(), floor: single.floor || undefined, comment: single.comment || undefined, excludeFromStats: single.excludeFromStats })
      .then(() => { setSingle({ number: '', floor: '', comment: '', excludeFromStats: false }); onChanged(); })
      .catch((e) => onError(e instanceof Error ? e.message : 'Ошибка'));
  };
  const addBulk = () => {
    if (!roomTypeId || !bulk.from.trim() || !bulk.to.trim()) { onError('Категория и диапазон обязательны'); return; }
    go(() => adminApi.pmsBulkRooms({ propertyId, roomTypeId, from: bulk.from.trim(), to: bulk.to.trim(), floor: bulk.floor || undefined, comment: bulk.comment || undefined, excludeFromStats: bulk.excludeFromStats }),
      () => setBulk({ from: '', to: '', floor: '', comment: '', excludeFromStats: false }));
  };
  const addBatch = () => {
    const items = batch.filter((r) => r.number.trim() && r.roomTypeId).map((r) => ({ number: r.number.trim(), roomTypeId: r.roomTypeId, floor: r.floor || undefined, comment: r.comment || undefined, excludeFromStats: r.excludeFromStats }));
    if (items.length === 0) { onError('Заполните хотя бы одну строку (номер + категория)'); return; }
    go(() => adminApi.pmsBatchRooms({ propertyId, rooms: items }), () => setBatch([{ number: '', roomTypeId: '', floor: '', comment: '', excludeFromStats: false }]));
  };

  const openEdit = (r: PmsRoom) => { setEditRoom(r); setEf({ number: r.number, floor: r.floor ?? '', address: r.address ?? '', roomTypeId: r.roomType.id, comment: r.comment ?? '', excludeFromStats: r.excludeFromStats, active: r.active, sectionId: r.sectionId ?? '', checkinInstructions: r.checkinInstructions ?? '', checkinPhotos: r.checkinPhotos ?? [] }); };
  const saveEdit = () => {
    if (!editRoom) return;
    if (!ef.number.trim() || !ef.roomTypeId) { onError('Номер и категория обязательны'); return; }
    onError('');
    void adminApi.pmsUpdateRoom(editRoom.id, { number: ef.number.trim(), floor: ef.floor || undefined, address: ef.address, roomTypeId: ef.roomTypeId, comment: ef.comment, excludeFromStats: ef.excludeFromStats, active: ef.active, sectionId: ef.sectionId, checkinInstructions: ef.checkinInstructions, checkinPhotos: ef.checkinPhotos })
      .then(() => { setEditRoom(null); onChanged(); }).catch((e) => onError(e instanceof Error ? e.message : 'Ошибка'));
  };
  const uploadPhoto = (file: File | undefined) => {
    if (!file) return;
    onError('');
    setPhotoUploading(true);
    void adminApi.uploadImage(file)
      .then((res) => setEf((prev) => ({ ...prev, checkinPhotos: [...prev.checkinPhotos, res.url] })))
      .catch((e) => onError(e instanceof Error ? e.message : 'Ошибка загрузки фото'))
      .finally(() => setPhotoUploading(false));
  };
  const delRoom = (r: PmsRoom) => { if (confirm(`Удалить номер №${r.number}?`)) void adminApi.pmsDeleteRoom(r.id).then(onChanged).catch((e) => onError(e instanceof Error ? e.message : 'Ошибка')); };

  // Массовое заполнение инструкций: номера выбранного объекта + текущее значение (черновик или из БД).
  const instrRooms = useMemo(
    () => rooms.filter((r) => r.property.id === propertyId).sort((a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true })),
    [rooms, propertyId],
  );
  const instrVal = (r: PmsRoom) => instrEdits[r.id] ?? { address: r.address ?? '', checkinInstructions: r.checkinInstructions ?? '' };
  const setInstr = (r: PmsRoom, patch: Partial<{ address: string; checkinInstructions: string }>) =>
    setInstrEdits((prev) => ({ ...prev, [r.id]: { ...instrVal(r), ...patch } }));
  const saveInstructions = () => {
    const items = Object.entries(instrEdits).map(([roomId, v]) => ({ roomId, address: v.address, checkinInstructions: v.checkinInstructions }));
    if (items.length === 0) { onError('Нет изменений для сохранения'); return; }
    onError('');
    setInstrSaving(true);
    void adminApi.pmsBulkInstructions({ items })
      .then((r) => { setInstrEdits({}); onChanged(); if (r.skipped.length) onError(`Сохранено: ${r.updated}. Пропущены: ${r.skipped.length}`); })
      .catch((e) => onError(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setInstrSaving(false));
  };

  // Список номеров, сгруппированный: объект → категория.
  const grouped = useMemo(() => {
    const byProp = new Map<string, { name: string; byCat: Map<string, { name: string; rooms: PmsRoom[] }> }>();
    for (const r of rooms) {
      const p = byProp.get(r.property.id) ?? { name: r.property.name, byCat: new Map() };
      const c = p.byCat.get(r.roomType.id) ?? { name: r.roomType.name, rooms: [] };
      c.rooms.push(r);
      p.byCat.set(r.roomType.id, c);
      byProp.set(r.property.id, p);
    }
    return [...byProp.entries()];
  }, [rooms]);

  return (
    <div>
      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="flex gap-1 rounded-lg bg-ink/5 p-1">
            {([['single', 'Добавить номер'], ['bulk', 'Массово (диапазон)'], ['batch', 'Множественно'], ['instructions', 'Инструкции (апартаменты)']] as [AddMode, string][]).map(([m, label]) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-md px-3 py-1 text-sm transition ${mode === m ? 'bg-white font-medium text-ink shadow-sm' : 'text-dark-gray hover:text-ink'}`}>{label}</button>
            ))}
          </div>
          <label className="block"><span className="sr-only">Объект</span>
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={`${selectCls} w-auto`}>{options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>
          </label>
          {mode !== 'batch' && mode !== 'instructions' && (
            <select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className={`${selectCls} w-auto`}>
              {cats.length === 0 ? <option value="">— нет категорий —</option> : cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
        </div>

        {mode === 'single' && (
          <div className="grid items-end gap-3 sm:grid-cols-5">
            <Input id="s-num" label="Номер" value={single.number} onChange={(e) => setSingle({ ...single, number: e.target.value })} />
            <Input id="s-floor" label="Этаж" value={single.floor} onChange={(e) => setSingle({ ...single, floor: e.target.value })} />
            <Input id="s-comment" label="Комментарий" value={single.comment} onChange={(e) => setSingle({ ...single, comment: e.target.value })} />
            <label className="flex items-center gap-2 pb-2 text-sm text-dark-gray"><input type="checkbox" checked={single.excludeFromStats} onChange={(e) => setSingle({ ...single, excludeFromStats: e.target.checked })} /> не в статистику</label>
            <Button onClick={addSingle} disabled={!roomTypeId}>Создать</Button>
          </div>
        )}
        {mode === 'bulk' && (
          <div>
            <div className="grid items-end gap-3 sm:grid-cols-6">
              <Input id="b-from" label="От (напр. 101)" value={bulk.from} onChange={(e) => setBulk({ ...bulk, from: e.target.value })} />
              <Input id="b-to" label="До (напр. 105)" value={bulk.to} onChange={(e) => setBulk({ ...bulk, to: e.target.value })} />
              <Input id="b-floor" label="Этаж" value={bulk.floor} onChange={(e) => setBulk({ ...bulk, floor: e.target.value })} />
              <Input id="b-comment" label="Комментарий" value={bulk.comment} onChange={(e) => setBulk({ ...bulk, comment: e.target.value })} />
              <label className="flex items-center gap-2 pb-2 text-sm text-dark-gray"><input type="checkbox" checked={bulk.excludeFromStats} onChange={(e) => setBulk({ ...bulk, excludeFromStats: e.target.checked })} /> не в статистику</label>
              <Button onClick={addBulk} disabled={!roomTypeId}>Создать</Button>
            </div>
            <p className="mt-2 text-xs text-dark-gray">Создаст все номера диапазона подряд в выбранной категории (существующие пропустит).</p>
          </div>
        )}
        {mode === 'batch' && (
          <div>
            <div className="space-y-2">
              {batch.map((r, i) => (
                <div key={i} className="grid items-center gap-2 sm:grid-cols-[1fr_1.5fr_0.8fr_1.5fr_auto_auto]">
                  <input placeholder="Номер" value={r.number} onChange={(e) => setBatch(batch.map((x, j) => j === i ? { ...x, number: e.target.value } : x))} className={selectCls} />
                  <select value={r.roomTypeId} onChange={(e) => setBatch(batch.map((x, j) => j === i ? { ...x, roomTypeId: e.target.value } : x))} className={selectCls}>
                    <option value="">— категория —</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input placeholder="Этаж" value={r.floor} onChange={(e) => setBatch(batch.map((x, j) => j === i ? { ...x, floor: e.target.value } : x))} className={selectCls} />
                  <input placeholder="Комментарий" value={r.comment} onChange={(e) => setBatch(batch.map((x, j) => j === i ? { ...x, comment: e.target.value } : x))} className={selectCls} />
                  <label className="flex items-center gap-1 text-xs text-dark-gray"><input type="checkbox" checked={r.excludeFromStats} onChange={(e) => setBatch(batch.map((x, j) => j === i ? { ...x, excludeFromStats: e.target.checked } : x))} /> не в стат.</label>
                  <button type="button" onClick={() => setBatch(batch.filter((_, j) => j !== i))} className="px-2 text-red-600" title="Удалить строку">✕</button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <Button variant="secondary" onClick={() => setBatch([...batch, { number: '', roomTypeId: '', floor: '', comment: '', excludeFromStats: false }])}>+ Строка</Button>
              <Button onClick={addBatch}>Создать все</Button>
            </div>
          </div>
        )}
        {mode === 'instructions' && (
          <div>
            <p className="mb-3 text-xs text-dark-gray">
              Заполните адрес и инструкцию по заселению для каждого номера объекта (режим апартаментов). Гость увидит их
              после регистрации и оплаты. Пустое поле — используется общая инструкция объекта. Для показа своих инструкций
              включите «Режим апартаментов» в карточке объекта (вкладка «Объекты»).
            </p>
            {instrRooms.length === 0 ? (
              <p className="text-sm text-dark-gray">В выбранном объекте нет номеров.</p>
            ) : (
              <>
                <div className="overflow-hidden rounded-lg border border-ink/10">
                  <div className="flex items-center gap-3 border-b border-ink/10 bg-ink/5 px-3 py-1.5 text-[11px] uppercase tracking-wide text-dark-gray">
                    <span className="w-14 shrink-0">Номер</span>
                    <span className="w-56 shrink-0">Адрес юнита</span>
                    <span className="flex-1">Инструкция по заселению</span>
                  </div>
                  {instrRooms.map((r) => {
                    const v = instrVal(r);
                    const dirty = instrEdits[r.id] !== undefined;
                    return (
                      <div key={r.id} className={`flex items-start gap-3 border-b border-ink/5 px-3 py-2 last:border-b-0 ${dirty ? 'bg-amber-50' : 'bg-white'}`}>
                        <span className="w-14 shrink-0 pt-1.5 text-sm font-medium text-ink">№{r.number}</span>
                        <input value={v.address} onChange={(e) => setInstr(r, { address: e.target.value })}
                          placeholder="Адрес, подъезд" className={`${selectCls} w-56 shrink-0`} />
                        <textarea value={v.checkinInstructions} onChange={(e) => setInstr(r, { checkinInstructions: e.target.value })}
                          rows={2} placeholder="Код домофона, этаж, парковка…" className={`${selectCls} flex-1`} />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <Button onClick={saveInstructions} disabled={instrSaving || Object.keys(instrEdits).length === 0}>
                    {instrSaving ? 'Сохранение…' : `Сохранить (${Object.keys(instrEdits).length})`}
                  </Button>
                  {Object.keys(instrEdits).length > 0 && (
                    <button type="button" onClick={() => setInstrEdits({})} className="text-sm text-dark-gray hover:text-ink">Сбросить</button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </Card>

      {/* Список номеров скрыт в режиме «Инструкции» — там своя таблица по объекту. */}
      {mode !== 'instructions' && grouped.length === 0 ? <p className="text-sm text-dark-gray">Номеров нет.</p> : null}
      <div className={`space-y-5 ${mode === 'instructions' ? 'hidden' : ''}`}>
        {grouped.map(([pid, p]) => (
          <div key={pid}>
            <p className="mb-2 text-sm font-medium text-ink">{p.name}</p>
            {[...p.byCat.entries()].map(([cid, c]) => (
              <div key={cid} className="mb-3">
                <p className="mb-1 text-xs uppercase tracking-wide text-dark-gray">{c.name} <span className="text-ink/30">· {c.rooms.length}</span></p>
                <div className="overflow-hidden rounded-lg border border-ink/10">
                  {[...c.rooms].sort((a, b) => a.number.localeCompare(b.number, 'ru', { numeric: true })).map((r) => (
                    <div key={r.id} className="flex items-center gap-3 border-b border-ink/5 bg-white px-3 py-1.5 text-sm last:border-b-0">
                      <span className="w-16 shrink-0 font-medium text-ink">№{r.number}</span>
                      <span className="w-16 shrink-0 text-xs text-dark-gray">{r.floor ? `эт. ${r.floor}` : ''}</span>
                      <span className="flex-1 truncate text-xs text-dark-gray">{r.comment ?? ''}</span>
                      {r.excludeFromStats ? <span className="shrink-0 rounded bg-amber-100 px-1 text-[10px] text-amber-800" title="Не учитывается в статистике">без стат.</span> : null}
                      {!r.active ? <span className="shrink-0 rounded bg-ink/10 px-1 text-[10px] text-dark-gray">неактивен</span> : null}
                      <button type="button" onClick={() => openEdit(r)} className="shrink-0 rounded px-2 py-0.5 text-xs text-ink hover:bg-ink/5" title="Редактировать">✎</button>
                      <button type="button" onClick={() => delRoom(r)} className="shrink-0 rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-50" title="Удалить">🗑</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {editRoom && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-6" onClick={() => setEditRoom(null)}>
          <Card className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 text-lg font-medium text-ink">Номер №{editRoom.number} · {editRoom.property.name}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input id="er-num" label="Номер" value={ef.number} onChange={(e) => setEf({ ...ef, number: e.target.value })} />
              <Input id="er-floor" label="Этаж" value={ef.floor} onChange={(e) => setEf({ ...ef, floor: e.target.value })} />
              <label className="block sm:col-span-2"><span className="mb-1.5 block text-sm text-dark-gray">Категория</span>
                <select value={ef.roomTypeId} onChange={(e) => setEf({ ...ef, roomTypeId: e.target.value })} className={selectCls}>
                  {editCats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              {sections.some((s) => s.propertyId === editRoom.property.id) ? (
                <label className="block sm:col-span-2"><span className="mb-1.5 block text-sm text-dark-gray">Секция (план уборок)</span>
                  <select value={ef.sectionId} onChange={(e) => setEf({ ...ef, sectionId: e.target.value })} className={selectCls}>
                    <option value="">Без секции</option>
                    {sections.filter((s) => s.propertyId === editRoom.property.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
              ) : null}
              <Input id="er-comment" label="Комментарий" className="sm:col-span-2" value={ef.comment} onChange={(e) => setEf({ ...ef, comment: e.target.value })} />
              <Input id="er-address" label="Адрес юнита (для апартаментов)" className="sm:col-span-2" value={ef.address} onChange={(e) => setEf({ ...ef, address: e.target.value })} />
              <label className="block sm:col-span-2"><span className="mb-1.5 block text-sm text-dark-gray">Инструкция по заселению этого номера (режим апартаментов)</span>
                <textarea value={ef.checkinInstructions} onChange={(e) => setEf({ ...ef, checkinInstructions: e.target.value })} rows={3} className={selectCls}
                  placeholder="Подъезд, код домофона, этаж, парковка… Гость увидит после регистрации и оплаты; если пусто — общая инструкция объекта." />
              </label>
              <div className="block sm:col-span-2">
                <span className="mb-1.5 block text-sm text-dark-gray">Фото-инструкция (вход, подъезд, сейф-бокс)</span>
                <div className="flex flex-wrap gap-2">
                  {ef.checkinPhotos.map((url, i) => (
                    <div key={url} className="group relative h-20 w-20 overflow-hidden rounded-lg border border-ink/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fileUrl(url)} alt={`Фото ${i + 1}`} className="h-full w-full object-cover" />
                      <button type="button" title="Удалить фото"
                        onClick={() => setEf({ ...ef, checkinPhotos: ef.checkinPhotos.filter((_, j) => j !== i) })}
                        className="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-xs text-white opacity-0 transition group-hover:opacity-100">✕</button>
                    </div>
                  ))}
                  <label className={`flex h-20 w-20 cursor-pointer items-center justify-center rounded-lg border border-dashed border-ink/25 text-xs text-dark-gray hover:border-ink/50 ${photoUploading ? 'opacity-50' : ''}`}>
                    {photoUploading ? '…' : '+ Фото'}
                    <input type="file" accept="image/*" className="hidden" disabled={photoUploading}
                      onChange={(e) => { uploadPhoto(e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                </div>
                <p className="mt-1 text-xs text-dark-gray">Гость увидит фото в портале после регистрации и оплаты. JPG/PNG до 10 МБ.</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-dark-gray"><input type="checkbox" checked={ef.excludeFromStats} onChange={(e) => setEf({ ...ef, excludeFromStats: e.target.checked })} /> Не учитывать в статистике</label>
              <label className="flex items-center gap-2 text-sm text-dark-gray"><input type="checkbox" checked={ef.active} onChange={(e) => setEf({ ...ef, active: e.target.checked })} /> Активен</label>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setEditRoom(null)}>Отмена</Button>
              <Button onClick={saveEdit}>Сохранить</Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─────────── Вкладка «Журнал изменений» ───────────
const ACTION_RU: Record<string, string> = {
  created: 'создано', updated: 'изменено', deleted: 'удалено', duplicated: 'скопировано',
  reordered: 'порядок', visibility_changed: 'видимость', bulk_created: 'массово создано',
  batch_created: 'создано (набор)', status_changed: 'статус',
};
function ChangelogTab() {
  const [entries, setEntries] = useState<RoomFundChangeEntry[]>([]);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    void adminApi.roomFundChangelog({ entity: entity || undefined, action: action || undefined, from: from || undefined, to: to || undefined })
      .then(setEntries).catch(() => undefined);
  }, [entity, action, from, to]);

  const hasFilter = Boolean(entity || action || from || to);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select value={entity} onChange={(e) => setEntity(e.target.value)} className={`${selectCls} w-auto`}>
          <option value="">Категории и номера</option>
          <option value="RoomType">Только категории</option>
          <option value="Room">Только номера</option>
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)} className={`${selectCls} w-auto`}>
          <option value="">Все действия</option>
          {Object.entries(ACTION_RU).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-dark-gray">с <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={selectCls} /></label>
        <label className="flex items-center gap-1 text-xs text-dark-gray">по <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={selectCls} /></label>
        {hasFilter ? <button type="button" onClick={() => { setEntity(''); setAction(''); setFrom(''); setTo(''); }} className="text-xs text-primary hover:underline">Сбросить</button> : null}
        <span className="ml-auto text-xs text-dark-gray">{entries.length} записей</span>
      </div>
      <Card>
        {entries.length === 0 ? <p className="text-sm text-dark-gray">Изменений нет.</p> : (
          <div className="divide-y divide-ink/5">
            {entries.map((e) => (
              <div key={e.id}>
                <button type="button" onClick={() => setOpenId(openId === e.id ? null : e.id)} className="flex w-full items-start gap-3 py-2 text-left text-sm hover:bg-ink/[0.02]">
                  <span className="w-36 shrink-0 text-xs text-dark-gray">{new Date(e.at).toLocaleString('ru-RU')}</span>
                  <span className="flex-1 text-ink">{describe(e)}</span>
                  <span className="shrink-0 text-ink/30">{openId === e.id ? '▾' : '▸'}</span>
                </button>
                {openId === e.id && e.payload ? (
                  <div className="mb-2 overflow-x-auto rounded-md bg-ink/[0.03] p-3 text-xs">
                    <table className="w-full"><tbody>
                      {Object.entries(e.payload).map(([k, v]) => (
                        <tr key={k}><td className="py-0.5 pr-3 align-top text-dark-gray">{FIELD_RU[k] ?? k}</td><td className="py-0.5 text-ink">{fmtVal(v)}</td></tr>
                      ))}
                    </tbody></table>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
function payloadSummary(p: Record<string, unknown> | null): string {
  if (!p) return '';
  if (typeof p.name === 'string') return p.name;
  if (typeof p.number === 'string') return `№${p.number}`;
  if (Array.isArray(p.created)) return `номера: ${(p.created as unknown[]).join(', ')}`;
  if (typeof p.range === 'string') return `диапазон ${p.range}`;
  return '';
}
function fmtVal(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'да' : 'нет';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Русские подписи полей для журнала. */
const FIELD_RU: Record<string, string> = {
  shortName: 'сокр. название', typeLabel: 'тип', mainPlaces: 'основные места', extraPlaces: 'доп. места',
  roomsInUnit: 'комнаты', areaMode: 'режим площади', areaSqm: 'площадь', areaSqmTo: 'площадь до', description: 'описание',
  amenities: 'оснащение', views: 'вид (легаси)', bedPreference: 'предпочтение: кровати', viewPreference: 'предпочтение: вид',
  priorityAmenities: 'приоритеты', photos: 'фото', address: 'адрес', latitude: 'широта', longitude: 'долгота',
  howToReach: 'как добраться', confirmationFileUrl: 'PDF-файл', showInBooking: 'показ в «Бронированиях»', showInOta: 'выгрузка на OTA',
  active: 'активность', comment: 'комментарий', excludeFromStats: 'не учитывать в статистике', floor: 'этаж', roomTypeId: 'категория',
  number: 'номер', name: 'название', from: 'диапазон от', to: 'диапазон до', range: 'диапазон', created: 'создано', skipped: 'пропущено',
};

/** Изменённые поля (для действия «изменено»), кроме имени/номера. */
function changedFields(p: Record<string, unknown> | null): string {
  if (!p) return '';
  const keys = Object.keys(p).filter((k) => k !== 'name' && k !== 'number' && k !== 'source');
  const named = keys.map((k) => FIELD_RU[k] ?? k);
  return named.length ? ` — ${named.join(', ')}` : '';
}

/** Развёрнутое описание записи журнала на русском: кто и что сделал. */
function describe(e: RoomFundChangeEntry): string {
  const who = e.actorName ?? 'Пользователь';
  const noun = e.entity === 'RoomType' ? 'категорию' : 'номер';
  const t = payloadSummary(e.payload);
  switch (e.action) {
    case 'created': return `${who} создал(а) ${noun}${t ? ` «${t}»` : ''}`;
    case 'updated': return `${who} изменил(а) ${noun}${t ? ` «${t}»` : ''}${changedFields(e.payload)}`;
    case 'deleted': return `${who} удалил(а) ${noun}${t ? ` «${t}»` : ''}`;
    case 'duplicated': return `${who} скопировал(а) ${noun}${t ? ` «${t}»` : ''}`;
    case 'reordered': return `${who} изменил(а) порядок категорий`;
    case 'visibility_changed': return `${who} изменил(а) видимость категории (Бронирования/OTA)`;
    case 'bulk_created': return `${who} массово создал(а) номера${t ? `: ${t}` : ''}`;
    case 'batch_created': return `${who} создал(а) номера${t ? `: ${t}` : ''}`;
    case 'status_changed': return `${who} изменил(а) статус номера`;
    default: return `${who}: ${ACTION_RU[e.action] ?? e.action}`;
  }
}
