'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, type PmsRoom, type PmsRoomOption } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

const HK: Record<string, string> = { CLEAN: 'Чисто', DIRTY: 'Грязно', INSPECTED: 'Проверено', IN_PROGRESS: 'Уборка' };
const MT: Record<string, string> = { OK: 'Исправен', OUT_OF_ORDER: 'Не работает' };
const SELL: Record<string, string> = { SELLABLE: 'Продаётся', NOT_SELLABLE: 'Снят с продажи' };

const selectCls = 'w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm';

export default function PmsRoomsPage() {
  const ready = useRequireAdmin();
  const [options, setOptions] = useState<PmsRoomOption[]>([]);
  const [rooms, setRooms] = useState<PmsRoom[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [roomTypeId, setRoomTypeId] = useState('');
  const [number, setNumber] = useState('');
  const [floor, setFloor] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const roomTypes = useMemo(
    () => options.find((p) => p.id === propertyId)?.roomTypes ?? [],
    [options, propertyId],
  );

  const load = () => adminApi.pmsRooms().then(setRooms).catch(() => undefined);
  useEffect(() => {
    if (!ready) return;
    void adminApi.pmsRoomOptions().then((o) => {
      setOptions(o);
      if (o[0]) setPropertyId(o[0].id);
    });
    void load();
  }, [ready]);

  // При смене объекта — сбросить выбранную категорию на первую доступную.
  useEffect(() => {
    setRoomTypeId(roomTypes[0]?.id ?? '');
  }, [roomTypes]);

  async function create() {
    setError('');
    if (!propertyId || !roomTypeId || !number.trim()) {
      setError('Заполните объект, категорию и номер');
      return;
    }
    setBusy(true);
    try {
      await adminApi.pmsCreateRoom({ propertyId, roomTypeId, number: number.trim(), floor: floor.trim() || undefined });
      setNumber('');
      setFloor('');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка создания');
    } finally {
      setBusy(false);
    }
  }

  const changeStatus = (id: string, body: { housekeepingStatus?: string; maintenanceStatus?: string; sellStatus?: string }) =>
    void adminApi.pmsRoomStatus(id, body).then(load).catch(() => undefined);

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">PMS · Номерной фонд</h1>
      <p className="mb-6 text-sm text-dark-gray">Конкретные номера/апартаменты. Источник истины — наш PMS (Путь B).</p>

      <Card className="mb-6">
        <div className="grid items-end gap-3 sm:grid-cols-5">
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Объект</span>
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={selectCls}>
              {options.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Категория</span>
            <select value={roomTypeId} onChange={(e) => setRoomTypeId(e.target.value)} className={selectCls}>
              {roomTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>{rt.name}</option>
              ))}
            </select>
          </label>
          <Input id="number" label="Номер" value={number} onChange={(e) => setNumber(e.target.value)} />
          <Input id="floor" label="Этаж" value={floor} onChange={(e) => setFloor(e.target.value)} />
          <Button onClick={() => void create()} disabled={busy}>Добавить</Button>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </Card>

      <div className="space-y-2">
        {rooms.length === 0 ? (
          <p className="text-sm text-dark-gray">Номеров пока нет. Добавьте первый выше.</p>
        ) : null}
        {rooms.map((r) => (
          <Card key={r.id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-[220px]">
              <p className="text-ink">
                № {r.number}
                {r.floor ? <span className="text-dark-gray"> · этаж {r.floor}</span> : null}
                {!r.active ? <span className="text-red-600"> · неактивен</span> : null}
              </p>
              <p className="text-xs text-dark-gray">{r.property.name} · {r.roomType.name}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={r.housekeepingStatus}
                onChange={(e) => changeStatus(r.id, { housekeepingStatus: e.target.value })}
                className="rounded-md border border-ink/20 bg-white px-2 py-1.5 text-xs"
              >
                {Object.entries(HK).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select
                value={r.maintenanceStatus}
                onChange={(e) => changeStatus(r.id, { maintenanceStatus: e.target.value })}
                className="rounded-md border border-ink/20 bg-white px-2 py-1.5 text-xs"
              >
                {Object.entries(MT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select
                value={r.sellStatus}
                onChange={(e) => changeStatus(r.id, { sellStatus: e.target.value })}
                className="rounded-md border border-ink/20 bg-white px-2 py-1.5 text-xs"
              >
                {Object.entries(SELL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <Button variant="secondary" onClick={() => void adminApi.pmsDeleteRoom(r.id).then(load)}>
                Удалить
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </main>
  );
}
