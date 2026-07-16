'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, type AvitoListing, type AvitoPollResult, type Channel, type ChannelMapping, type ChannelMonitoring, type ChannelSyncJob, type PmsRoomOption } from '../../../lib/api';
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
  const [sel, setSel] = useState('');
  const [mon, setMon] = useState<ChannelMonitoring | null>(null);
  const [maps, setMaps] = useState<ChannelMapping | null>(null);
  const [jobs, setJobs] = useState<ChannelSyncJob[]>([]);
  const [error, setError] = useState('');

  const [nc, setNc] = useState({ provider: 'avito', code: 'avito', name: 'Avito', token: '', clientId: '', clientSecret: '', userId: '' });
  const [mp, setMp] = useState({ propertyId: '', remoteProperty: '', roomTypeId: '', remoteRoomType: '' });
  const roomTypes = useMemo(() => options.find((p) => p.id === mp.propertyId)?.roomTypes ?? [], [options, mp.propertyId]);
  // Плоский список всех категорий (объект · категория) — для сопоставления объявлений Avito.
  const allCategories = useMemo(() => options.flatMap((p) => p.roomTypes.map((rt) => ({ id: rt.id, label: `${p.name} · ${rt.name}` }))), [options]);

  const [listings, setListings] = useState<AvitoListing[] | null>(null);
  const [listingPick, setListingPick] = useState<Record<string, string>>({});
  const [pollRes, setPollRes] = useState<AvitoPollResult | null>(null);
  const [busy, setBusy] = useState(false);

  const loadChannels = () => adminApi.channels().then(setChannels).catch(() => undefined);
  useEffect(() => {
    if (!ready) return;
    void loadChannels();
    void adminApi.pmsRoomOptions().then((o) => { setOptions(o); if (o[0]) setMp((s) => ({ ...s, propertyId: o[0]!.id })); });
  }, [ready]);

  const loadDetail = (id: string) => {
    void adminApi.channel(id).then(setMon).catch(() => undefined);
    void adminApi.channelMappings(id).then(setMaps).catch(() => undefined);
    void adminApi.channelSyncJobs(id).then(setJobs).catch(() => undefined);
  };
  useEffect(() => { if (sel) { loadDetail(sel); setListings(null); setPollRes(null); } }, [sel]);
  useEffect(() => { setMp((s) => ({ ...s, roomTypeId: roomTypes[0]?.id ?? '' })); }, [roomTypes]);

  const run = (fn: () => Promise<unknown>) => { setError(''); void fn().then(() => { if (sel) loadDetail(sel); loadChannels(); }).catch((e) => setError(e instanceof Error ? e.message : 'Ошибка')); };
  const isAvito = mon?.provider === 'avito';

  async function createChannel() {
    setError('');
    if (!nc.code || !nc.name) { setError('Укажите код и название'); return; }
    let credentials: Record<string, unknown> | undefined;
    if (nc.provider === 'avito') {
      if (!nc.clientId || !nc.clientSecret || !nc.userId) { setError('Для Avito укажите Client ID, Client Secret и номер аккаунта'); return; }
      credentials = { provider: 'avito', clientId: nc.clientId, clientSecret: nc.clientSecret, userId: Number(nc.userId), pushMode: 'off' };
    } else if (nc.token) {
      credentials = { token: nc.token };
    }
    try {
      const c = await adminApi.createChannel({ code: nc.code, name: nc.name, kind: 'OTA', credentials });
      setNc({ provider: 'avito', code: 'avito', name: 'Avito', token: '', clientId: '', clientSecret: '', userId: '' });
      await loadChannels();
      setSel(c.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); }
  }

  async function loadListings() {
    if (!mon) return;
    setBusy(true); setError('');
    try { setListings(await adminApi.avitoListings(mon.id)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Не удалось получить объявления'); }
    finally { setBusy(false); }
  }

  async function pollNow() {
    if (!mon) return;
    setBusy(true); setError('');
    try { setPollRes(await adminApi.pollAvito(mon.id)); loadDetail(mon.id); }
    catch (e) { setError(e instanceof Error ? e.message : 'Поллинг не удался'); }
    finally { setBusy(false); }
  }

  async function mapListing(item: AvitoListing) {
    if (!mon) return;
    const roomTypeId = listingPick[String(item.id)];
    if (!roomTypeId) return;
    setError('');
    try {
      await adminApi.setChannelMapping(mon.id, 'room-type', { localId: roomTypeId, remoteId: String(item.id) });
      await loadListings();
      loadDetail(mon.id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка маппинга'); }
  }

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">PMS · Каналы продаж</h1>
      <p className="mb-6 text-sm text-dark-gray">Channel Manager: подключение каналов, сопоставление объявлений, приём OTA-броней.</p>

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
              <label><span className="mb-1 block text-xs text-dark-gray">Тип канала</span>
                <select value={nc.provider} onChange={(e) => setNc({ ...nc, provider: e.target.value, code: e.target.value === 'avito' ? 'avito' : nc.code, name: e.target.value === 'avito' ? 'Avito' : nc.name })} className={selectCls}>
                  <option value="avito">Avito</option>
                  <option value="generic">Другой / mock</option>
                </select>
              </label>
              <Input id="cc" label="Код (уникальный)" value={nc.code} onChange={(e) => setNc({ ...nc, code: e.target.value })} />
              <Input id="cn" label="Название" value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} />
              {nc.provider === 'avito' ? (
                <>
                  <Input id="acid" label="Client ID" value={nc.clientId} onChange={(e) => setNc({ ...nc, clientId: e.target.value })} />
                  <Input id="acs" label="Client Secret" value={nc.clientSecret} onChange={(e) => setNc({ ...nc, clientSecret: e.target.value })} />
                  <Input id="auid" label="Номер аккаунта (self.id)" value={nc.userId} onChange={(e) => setNc({ ...nc, userId: e.target.value })} />
                  <p className="text-xs text-dark-gray">Выгрузка цен/календаря в Avito по умолчанию выключена — канал только принимает брони.</p>
                </>
              ) : (
                <Input id="ct" label="Токен приёма броней (опц.)" value={nc.token} onChange={(e) => setNc({ ...nc, token: e.target.value })} />
              )}
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

              {isAvito ? (
                <Card>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink">Avito · объявления и брони</p>
                    <div className="flex gap-2">
                      <Button variant="secondary" onClick={() => void loadListings()} disabled={busy}>Загрузить объявления</Button>
                      <Button onClick={() => void pollNow()} disabled={busy}>Опросить брони</Button>
                    </div>
                  </div>
                  {pollRes ? (
                    <p className="mb-3 text-xs text-dark-gray">Опрошено объявлений {pollRes.items}, броней {pollRes.fetched}: заведено <span className="text-emerald-700">{pollRes.ingested}</span>, отмен {pollRes.cancelled}, конфликтов <span className={pollRes.conflicts ? 'text-red-700' : ''}>{pollRes.conflicts}</span>, дублей {pollRes.duplicates}, ошибок {pollRes.errors}.</p>
                  ) : null}
                  {listings === null ? (
                    <p className="text-sm text-dark-gray">Нажмите «Загрузить объявления», чтобы сопоставить их с категориями.</p>
                  ) : listings.length === 0 ? (
                    <p className="text-sm text-dark-gray">В аккаунте Avito нет объявлений.</p>
                  ) : (
                    <div className="space-y-2">
                      {listings.map((it) => (
                        <div key={it.id} className="flex flex-wrap items-end justify-between gap-2 border-b border-ink/10 pb-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-ink">{it.title ?? it.id}</p>
                            <p className="truncate text-xs text-dark-gray">{it.address} · {it.price ? `${it.price.toLocaleString('ru-RU')} ₽` : ''} · id {it.id}</p>
                          </div>
                          {it.mappedRoomTypeId ? (
                            <span className="text-xs text-emerald-700">✓ сопоставлено</span>
                          ) : (
                            <div className="flex items-end gap-2">
                              <select value={listingPick[String(it.id)] ?? ''} onChange={(e) => setListingPick({ ...listingPick, [String(it.id)]: e.target.value })} className={`${selectCls} max-w-xs`}>
                                <option value="">— категория —</option>
                                {allCategories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                              </select>
                              <Button variant="secondary" onClick={() => void mapListing(it)} disabled={!listingPick[String(it.id)]}>↔</Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ) : (
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
                </Card>
              )}

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
