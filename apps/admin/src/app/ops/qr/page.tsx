'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Button, Card } from '@dha/ui';
import { adminApi, type OpsZone, type PmsRoom, type PmsRoomOption } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

const selectCls = 'rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';

/**
 * QR-коды объектов (v2 ТЗ): наклейка на дверь — сотрудник сканирует и попадает
 * в задачи этого номера/зоны (/ops/tasks?roomId=…). Печать листом.
 */
export default function OpsQrPage() {
  const ready = useRequireAdmin();
  const [options, setOptions] = useState<PmsRoomOption[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [rooms, setRooms] = useState<PmsRoom[]>([]);
  const [zones, setZones] = useState<OpsZone[]>([]);
  const [codes, setCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!ready) return;
    void adminApi.pmsRoomOptions().then((o) => { setOptions(o); if (o[0]) setPropertyId(o[0].id); });
    void adminApi.pmsRooms().then(setRooms).catch(() => undefined);
    void adminApi.opsZones().then(setZones).catch(() => undefined);
  }, [ready]);

  const propRooms = rooms.filter((r) => r.property.id === propertyId && r.active);
  const propZones = zones.filter((z) => z.propertyId === propertyId);

  // Генерация data-URL кодов для видимых объектов.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const base = window.location.origin;
      const next: Record<string, string> = {};
      for (const r of propRooms) next[`room:${r.id}`] = await QRCode.toDataURL(`${base}/ops/tasks?roomId=${r.id}`, { margin: 1, width: 220 });
      for (const z of propZones) next[`zone:${z.id}`] = await QRCode.toDataURL(`${base}/ops/tasks?zoneId=${z.id}`, { margin: 1, width: 220 });
      if (!cancelled) setCodes(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, rooms.length, zones.length]);

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  const propertyName = options.find((o) => o.id === propertyId)?.name ?? '';

  return (
    <main className="px-8 py-8">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-3xl font-light text-ink">Операции · QR-коды объектов</h1>
        <div className="flex gap-2">
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className={selectCls}>
            {options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <Button onClick={() => window.print()}>Печать листа</Button>
        </div>
      </div>
      <p className="mb-6 text-sm text-dark-gray print:hidden">
        Наклейте QR на дверь/в подсобке: сотрудник сканирует телефоном и видит задачи этого номера или зоны
        (после входа в админку). Печатайте листом и разрезайте.
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3">
        {propRooms.map((r) => (
          <Card key={r.id} className="flex flex-col items-center !p-4 text-center print:break-inside-avoid">
            {codes[`room:${r.id}`] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={codes[`room:${r.id}`]} alt={`QR №${r.number}`} className="h-36 w-36" />
            ) : <div className="h-36 w-36 animate-pulse rounded bg-slate-100" />}
            <p className="mt-2 text-lg font-semibold text-ink">№{r.number}</p>
            <p className="text-xs text-slate-400">{propertyName}{r.floor ? ` · этаж ${r.floor}` : ''}</p>
          </Card>
        ))}
        {propZones.map((z) => (
          <Card key={z.id} className="flex flex-col items-center !p-4 text-center print:break-inside-avoid">
            {codes[`zone:${z.id}`] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={codes[`zone:${z.id}`]} alt={`QR ${z.name}`} className="h-36 w-36" />
            ) : <div className="h-36 w-36 animate-pulse rounded bg-slate-100" />}
            <p className="mt-2 text-lg font-semibold text-ink">{z.name}</p>
            <p className="text-xs text-slate-400">{propertyName} · зона</p>
          </Card>
        ))}
        {propRooms.length === 0 && propZones.length === 0 ? <p className="text-sm text-dark-gray">Нет номеров и зон.</p> : null}
      </div>
    </main>
  );
}
