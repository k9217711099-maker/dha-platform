'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, type Channel, type ChannelMapping, type ChannelMonitoring, type ChannelSyncJob, type PmsRatePlan, type PmsRoomOption } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

const selectCls = 'w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';
const JOB_CLS: Record<string, string> = {
  PENDING: 'text-amber-700', PROCESSING: 'text-sky-700', SUCCESS: 'text-emerald-700',
  RETRY_SCHEDULED: 'text-amber-700', DEAD_LETTER: 'text-red-700', FAILED: 'text-red-700', CANCELLED: 'text-dark-gray',
};
const dt = (s: string | null) => (s ? new Date(s).toLocaleString('ru-RU') : '—');

export default function PmsChannelsPage() {
  const ready = useRequireAdmin();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [options, setOptions] = useState<PmsRoomOption[]>([]);
  const [plans, setPlans] = useState<PmsRatePlan[]>([]);
  const [sel, setSel] = useState('');
  const [mon, setMon] = useState<ChannelMonitoring | null>(null);
  const [maps, setMaps] = useState<ChannelMapping | null>(null);
  const [jobs, setJobs] = useState<ChannelSyncJob[]>([]);
  const [error, setError] = useState('');

  const [nc, setNc] = useState({ code: '', name: '', kind: 'OTA', token: '' });
  const [mp, setMp] = useState({ propertyId: '', remoteProperty: '', roomTypeId: '', remoteRoomType: '', ratePlanId: '', remoteRatePlan: '' });
  const roomTypes = useMemo(() => options.find((p) => p.id === mp.propertyId)?.roomTypes ?? [], [options, mp.propertyId]);

  const loadChannels = () => adminApi.channels().then(setChannels).catch(() => undefined);
  useEffect(() => {
    if (!ready) return;
    void loadChannels();
    void adminApi.pmsRoomOptions().then((o) => { setOptions(o); if (o[0]) setMp((s) => ({ ...s, propertyId: o[0]!.id })); });
    void adminApi.pmsRatePlans().then(setPlans).catch(() => undefined);
  }, [ready]);

  const loadDetail = (id: string) => {
    void adminApi.channel(id).then(setMon).catch(() => undefined);
    void adminApi.channelMappings(id).then(setMaps).catch(() => undefined);
    void adminApi.channelSyncJobs(id).then(setJobs).catch(() => undefined);
  };
  useEffect(() => { if (sel) loadDetail(sel); }, [sel]);
  useEffect(() => { setMp((s) => ({ ...s, roomTypeId: roomTypes[0]?.id ?? '' })); }, [roomTypes]);

  const run = (fn: () => Promise<unknown>) => { setError(''); void fn().then(() => { if (sel) loadDetail(sel); loadChannels(); }).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка')); };

  async function createChannel() {
    setError('');
    if (!nc.code || !nc.name) { setError('Укажите код и название'); return; }
    try {
      const c = await adminApi.createChannel({ code: nc.code, name: nc.name, kind: nc.kind, credentials: nc.token ? { token: nc.token } : undefined });
      setNc({ code: '', name: '', kind: 'OTA', token: '' });
      await loadChannels();
      setSel(c.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
  }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">PMS · Каналы продаж</h1>
      <p className="mb-6 text-sm text-dark-gray">Channel Manager: подключение каналов, маппинги, синхронизация наличия и приём OTA-броней.</p>

      <div className="mb-4 flex items-center gap-3">
        <Button variant="secondary" onClick={() => run(() => adminApi.runChannelSync())}>Обработать очередь синка</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <Card>
            <p className="mb-3 text-sm font-medium text-ink">Каналы</p>
            <div className="space-y-1.5">
              {channels.map((c) => (
                <button key={c.id} type="button" onClick={() => setSel(c.id)} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${sel === c.id ? 'bg-beige' : 'hover:bg-beige/50'}`}>
                  <span className="text-ink">{c.name}<span className="ml-1 text-xs text-dark-gray">{c.code}</span></span>
                  <span className={`text-xs ${c.status === 'CONNECTED' ? 'text-emerald-700' : 'text-dark-gray'}`}>{c.active ? c.status : 'выкл.'}</span>
                </button>
              ))}
              {channels.length === 0 ? <p className="text-sm text-dark-gray">Каналов нет.</p> : null}
            </div>
          </Card>
          <Card>
            <p className="mb-3 text-sm font-medium text-ink">Новый канал</p>
            <div className="space-y-3">
              <Input id="cc" label="Код (ostrovok, avito…)" value={nc.code} onChange={(e) => setNc({ ...nc, code: e.target.value })} />
              <Input id="cn" label="Название" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
              <Input id="ct" label="Токен приёма броней (опц.)" value={nc.token} onChange={(e) => setNc({ ...nc, token: e.target.value })} />
              <Button onClick={() => void createChannel()}>Подключить</Button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {!sel || !mon ? <Card><p className="text-sm text-dark-gray">Выберите канал слева.</p></Card> : (
            <>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-lg text-ink">{mon.name} <span className="text-sm text-dark-gray">{mon.code}</span></p>
                    <p className="text-xs text-dark-gray">Синк: {dt(mon.lastSyncAt)} · Бронь: {dt(mon.lastBookingAt)}</p>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-dark-gray">
                    <input type="checkbox" checked={mon.active} onChange={(e) => run(() => adminApi.updateChannel(mon.id, { active: e.target.checked }))} /> активен
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {Object.entries(mon.jobs).map(([k, v]) => <span key={k} className="rounded bg-ink/10 px-2 py-1 text-dark-gray">{k}: <span className="text-ink">{v}</span></span>)}
                </div>
              </Card>

              <Card>
                <p className="mb-3 text-sm font-medium text-ink">Маппинги</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="flex items-end gap-2">
                    <label className="flex-1"><span className="mb-1 block text-xs text-dark-gray">Объект</span>
                      <select value={mp.propertyId} onChange={(e) => setMp({ ...mp, propertyId: e.target.value })} className={selectCls}>{options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                    </label>
                    <Input id="rp" label="ID в канале" value={mp.remoteProperty} onChange={(e) => setMp({ ...mp, remoteProperty: e.target.value })} />
                    <Button variant="secondary" onClick={() => run(() => adminApi.setChannelMapping(mon.id, 'property', { localId: mp.propertyId, remoteId: mp.remoteProperty }))} disabled={!mp.remoteProperty}>↔</Button>
                  </div>
                  <div className="flex items-end gap-2">
                    <label className="flex-1"><span className="mb-1 block text-xs text-dark-gray">Категория</span>
                      <select value={mp.roomTypeId} onChange={(e) => setMp({ ...mp, roomTypeId: e.target.value })} className={selectCls}>{roomTypes.map((rt) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}</select>
                    </label>
                    <Input id="rr" label="ID в канале" value={mp.remoteRoomType} onChange={(e) => setMp({ ...mp, remoteRoomType: e.target.value })} />
                    <Button variant="secondary" onClick={() => run(() => adminApi.setChannelMapping(mon.id, 'room-type', { localId: mp.roomTypeId, remoteId: mp.remoteRoomType }))} disabled={!mp.remoteRoomType}>↔</Button>
                  </div>
                </div>
                {maps ? (
                  <div className="mt-3 space-y-1 text-xs text-dark-gray">
                    {maps.property.map((m) => <p key={m.id}>Объект {m.propertyId.slice(0, 8)}… ↔ <span className="text-ink">{m.remotePropertyId}</span></p>)}
                    {maps.roomType.map((m) => <p key={m.id}>Категория {m.roomTypeId.slice(0, 8)}… ↔ <span className="text-ink">{m.remoteRoomTypeId}</span></p>)}
                  </div>
                ) : null}
                <div className="mt-4 flex items-end gap-2 border-t border-ink/10 pt-3">
                  <label className="flex-1 max-w-xs"><span className="mb-1 block text-xs text-dark-gray">Выгрузить наличие по объекту</span>
                    <select value={mp.propertyId} onChange={(e) => setMp({ ...mp, propertyId: e.target.value })} className={selectCls}>{options.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                  </label>
                  <Button onClick={() => run(() => adminApi.enqueueChannelSync(mon.id, { propertyId: mp.propertyId, jobType: 'AVAILABILITY' }))}>Поставить синк</Button>
                </div>
              </Card>

              <Card>
                <p className="mb-3 text-sm font-medium text-ink">Задачи синхронизации</p>
                <div className="space-y-1.5">
                  {jobs.length === 0 ? <p className="text-sm text-dark-gray">Задач нет.</p> : null}
                  {jobs.map((jb) => (
                    <div key={jb.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-dark-gray">{jb.jobType} · <span className={JOB_CLS[jb.status] ?? 'text-ink'}>{jb.status}</span>{jb.errorCode ? ` · ${jb.errorCode}` : ''} · попыток {jb.retryCount}/{jb.maxRetries}</span>
                      {jb.status === 'DEAD_LETTER' ? <Button variant="secondary" onClick={() => run(() => adminApi.retrySyncJob(jb.id))}>Повторить</Button> : null}
                    </div>
                  ))}
                </div>
              </Card>

              {mon.recentLogs.length > 0 ? (
                <Card>
                  <p className="mb-3 text-sm font-medium text-ink">Журнал синка</p>
                  <div className="space-y-1 text-xs text-dark-gray">
                    {mon.recentLogs.map((l) => <p key={l.id}>{dt(l.createdAt)} · {l.operation} · <span className="text-ink">{l.status}</span> · {l.message}</p>)}
                  </div>
                </Card>
              ) : null}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
