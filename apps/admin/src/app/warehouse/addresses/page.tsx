'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, type WhAddress, type WhMeta, type WhWarehouse } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

export default function WarehouseAddressesPage() {
  const ready = useRequireAdmin();
  const [addresses, setAddresses] = useState<WhAddress[]>([]);
  const [warehouses, setWarehouses] = useState<WhWarehouse[]>([]);
  const [meta, setMeta] = useState<WhMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // форма адреса
  const [name, setName] = useState('');
  const [type, setType] = useState('APARTMENTS');
  const [fullAddress, setFullAddress] = useState('');
  const [roomsCount, setRoomsCount] = useState(0);
  const [responsible, setResponsible] = useState('');

  const addrTypeLabel = (v: string) => meta?.addressTypes.find((o) => o.value === v)?.label ?? v;
  const whTypeLabel = (v: string) => meta?.warehouseTypes.find((o) => o.value === v)?.label ?? v;

  const load = () => {
    adminApi.whAddresses().then(setAddresses).catch((e) => setError(e.message));
    adminApi.whWarehouses().then(setWarehouses).catch(() => undefined);
  };
  useEffect(() => {
    if (ready) {
      load();
      adminApi.whMeta().then(setMeta).catch(() => undefined);
    }
  }, [ready]);

  async function createAddress() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await adminApi.whCreateAddress({
        name: name.trim(),
        type,
        fullAddress: fullAddress.trim() || undefined,
        roomsCount: roomsCount || undefined,
        responsible: responsible.trim() || undefined,
      } as Partial<WhAddress>);
      setName('');
      setFullAddress('');
      setRoomsCount(0);
      setResponsible('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <main className="px-6 py-10 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Склад · Адреса и склады</h1>
      <p className="mb-5 text-sm text-dark-gray">Объекты сети и их склады (§4.2, §4.3). У каждого адреса создаётся локальный склад.</p>

      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

      <Card className="mb-6 space-y-3">
        <h2 className="text-lg text-ink">Новый адрес / объект</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input id="name" label="Название объекта" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Тип</span>
            <select value={type} onChange={(e) => setType(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
              {(meta?.addressTypes ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <Input id="rooms" label="Кол-во номеров" type="number" min={0} value={roomsCount} onChange={(e) => setRoomsCount(Number(e.target.value))} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input id="full" label="Полный адрес" value={fullAddress} onChange={(e) => setFullAddress(e.target.value)} />
          <Input id="resp" label="Ответственный" value={responsible} onChange={(e) => setResponsible(e.target.value)} />
        </div>
        <Button onClick={() => void createAddress()} disabled={busy}>
          Добавить адрес
        </Button>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-lg text-ink">Адреса</h2>
          <div className="space-y-2">
            {addresses.map((a) => (
              <div key={a.id} className="border-b border-ink/5 pb-2 last:border-0">
                <p className={a.active ? 'text-ink' : 'text-dark-gray line-through'}>
                  {a.name} <span className="text-xs text-dark-gray">· {addrTypeLabel(a.type)}</span>
                </p>
                <p className="text-xs text-dark-gray">
                  {[a.fullAddress, a.roomsCount ? `${a.roomsCount} номеров` : '', a.responsible].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg text-ink">Склады</h2>
          <div className="space-y-2">
            {warehouses.map((w) => (
              <div key={w.id} className="flex items-center justify-between border-b border-ink/5 pb-2 last:border-0">
                <span className={w.active ? 'text-ink' : 'text-dark-gray line-through'}>{w.name}</span>
                <span className="text-xs text-dark-gray">{whTypeLabel(w.type)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
