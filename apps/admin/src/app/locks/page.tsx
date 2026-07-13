'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import {
  adminApi,
  type DbLock,
  type LockCoverage,
  type LockRecord,
  type PmsRoom,
  type PropertyTree,
  type TtlockLock,
} from '../../lib/api';
import { useRequireAdmin } from '../../lib/use-admin';

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TARGETS = [
  { value: 'ROOM', label: 'Дверь номера' },
  { value: 'ENTRANCE', label: 'Входная' },
  { value: 'BUILDING_DOOR', label: 'Подъезд' },
  { value: 'FLOOR', label: 'Этаж' },
  { value: 'PARKING', label: 'Паркинг' },
  { value: 'SPA', label: 'SPA' },
  { value: 'COWORKING', label: 'Коворкинг' },
];

const COVERAGE_LABEL: Record<LockCoverage, string> = {
  ROOM: 'Дверь номера',
  PROPERTY: 'Весь объект',
  FLOOR: 'Этаж',
  ROOM_LIST: 'Список номеров',
};

/** Уникальные этажи объекта, по возрастанию. */
function floorsOf(rooms: PmsRoom[]): string[] {
  const set = new Set<string>();
  for (const r of rooms) if (r.floor) set.add(r.floor);
  return [...set].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
}

export default function LocksPage() {
  const ready = useRequireAdmin();
  const [props, setProps] = useState<PropertyTree[]>([]);
  const [propertyId, setPropertyId] = useState('');
  const [rooms, setRooms] = useState<PmsRoom[]>([]);
  const [ttlocks, setTtlocks] = useState<TtlockLock[]>([]);
  const [locks, setLocks] = useState<DbLock[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const roomName = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rooms) m.set(r.id, r.number);
    return m;
  }, [rooms]);
  const floors = useMemo(() => floorsOf(rooms), [rooms]);

  const loadLocks = () =>
    propertyId ? adminApi.locks(propertyId).then(setLocks).catch(() => undefined) : Promise.resolve();

  useEffect(() => {
    if (!ready) return;
    adminApi.catalogProperties().then(setProps).catch(() => undefined);
    adminApi.ttlockLocks().then(setTtlocks).catch((e) => setMsg(`TTLock: ${e.message}`));
  }, [ready]);

  useEffect(() => {
    if (!propertyId) {
      setRooms([]);
      setLocks([]);
      return;
    }
    adminApi.pmsRooms({ propertyId }).then(setRooms).catch(() => undefined);
    void loadLocks();
  }, [propertyId]);

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="space-y-6 px-8 py-8">
      <h1 className="text-3xl font-light text-ink">Замки и двери</h1>
      <p className="max-w-2xl text-sm text-dark-gray">
        Личную дверь привязывайте к конкретному номеру, общие двери (подъезд, этаж, паркинг) — задавайте
        зоной покрытия. При выдаче ключа гость получит коды ко всем дверям своего номера.
      </p>
      {msg && <p className="text-sm text-ink">{msg}</p>}

      <TtlockCredsCard />

      <Card className="space-y-3">
        <label className="block max-w-sm">
          <span className="mb-1.5 block text-sm text-dark-gray">Объект</span>
          <select
            value={propertyId}
            onChange={(e) => setPropertyId(e.target.value)}
            className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm"
          >
            <option value="">— выберите объект —</option>
            {props.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        {propertyId && (
          <p className="text-xs text-dark-gray">
            Номеров в объекте: {rooms.length} · этажей: {floors.length || '—'}
          </p>
        )}
      </Card>

      {propertyId && (
        <>
          <AddLockCard
            propertyId={propertyId}
            ttlocks={ttlocks}
            rooms={rooms}
            floors={floors}
            onCreated={loadLocks}
          />

          <Card>
            <h2 className="mb-3 text-lg text-ink">Замки объекта</h2>
            {locks.length === 0 && <p className="text-sm text-dark-gray">Пока нет.</p>}
            <div className="space-y-4">
              {locks.map((l) => (
                <LockRow
                  key={l.id}
                  lock={l}
                  rooms={rooms}
                  floors={floors}
                  roomName={roomName}
                  onChanged={loadLocks}
                />
              ))}
            </div>
          </Card>
        </>
      )}
    </main>
  );
}

/** Краткое описание зоны покрытия замка. */
function coverageSummary(lock: DbLock, roomName: Map<string, string>): string {
  switch (lock.coverage) {
    case 'PROPERTY':
      return 'Весь объект';
    case 'FLOOR':
      return `Этаж ${lock.coverageFloor ?? '—'}`;
    case 'ROOM': {
      const n = lock.roomLinks[0] ? roomName.get(lock.roomLinks[0].roomId) : undefined;
      return n ? `Номер ${n}` : 'Номер не выбран';
    }
    case 'ROOM_LIST': {
      const names = lock.roomLinks.map((r) => roomName.get(r.roomId) ?? '?');
      return names.length ? `Номера: ${names.join(', ')}` : 'Список пуст';
    }
    default:
      return '—';
  }
}

/** Мультивыбор номеров с быстрым переключением по этажам. */
function RoomPicker({
  rooms,
  floors,
  selected,
  onChange,
}: {
  rooms: PmsRoom[];
  floors: string[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  };
  const toggleFloor = (floor: string) => {
    const ids = rooms.filter((r) => r.floor === floor).map((r) => r.id);
    const allOn = ids.every((id) => selected.has(id));
    const next = new Set(selected);
    for (const id of ids) (allOn ? next.delete(id) : next.add(id));
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {floors.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {floors.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => toggleFloor(f)}
              className="rounded-full border border-ink/20 px-2.5 py-0.5 text-xs text-dark-gray hover:bg-beige/50"
            >
              этаж {f}
            </button>
          ))}
        </div>
      )}
      <div className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-ink/10 bg-white p-2">
        {rooms.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => toggle(r.id)}
            className={`rounded-md border px-2 py-1 text-xs ${
              selected.has(r.id) ? 'border-primary bg-primary/10 text-ink' : 'border-ink/15 text-dark-gray'
            }`}
          >
            {r.number}
            {r.floor ? <span className="text-ink/40"> · эт.{r.floor}</span> : null}
          </button>
        ))}
        {rooms.length === 0 && <span className="text-xs text-dark-gray">Нет номеров.</span>}
      </div>
      <p className="text-xs text-dark-gray">Выбрано: {selected.size}</p>
    </div>
  );
}

function AddLockCard({
  propertyId,
  ttlocks,
  rooms,
  floors,
  onCreated,
}: {
  propertyId: string;
  ttlocks: TtlockLock[];
  rooms: PmsRoom[];
  floors: string[];
  onCreated: () => void;
}) {
  const [ttlockLockId, setTtlockLockId] = useState('');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('ROOM');
  const [coverage, setCoverage] = useState<LockCoverage>('ROOM');
  const [coverageFloor, setCoverageFloor] = useState('');
  const [singleRoom, setSingleRoom] = useState('');
  const [roomSet, setRoomSet] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Тип двери задаёт разумную зону по умолчанию.
  function onTarget(next: string) {
    setTarget(next);
    setCoverage(next === 'ROOM' ? 'ROOM' : 'PROPERTY');
  }

  async function create() {
    setMsg(null);
    if (!ttlockLockId || !name.trim()) {
      setMsg('Выберите замок TTLock и название');
      return;
    }
    let roomIds: string[] | undefined;
    if (coverage === 'ROOM') {
      if (!singleRoom) return setMsg('Выберите номер для личной двери');
      roomIds = [singleRoom];
    } else if (coverage === 'ROOM_LIST') {
      if (roomSet.size === 0) return setMsg('Выберите хотя бы один номер');
      roomIds = [...roomSet];
    } else if (coverage === 'FLOOR' && !coverageFloor) {
      return setMsg('Выберите этаж');
    }
    setBusy(true);
    try {
      const tl = ttlocks.find((x) => x.ttlockLockId === ttlockLockId);
      await adminApi.createLock({
        propertyId,
        ttlockLockId,
        name: name.trim(),
        target,
        coverage,
        coverageFloor: coverage === 'FLOOR' ? coverageFloor : undefined,
        roomIds,
        hasGateway: tl?.hasGateway,
      });
      setName('');
      setTtlockLockId('');
      setSingleRoom('');
      setRoomSet(new Set());
      setCoverageFloor('');
      onCreated();
      setMsg('Замок добавлен');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  const isRoomDoor = target === 'ROOM';

  return (
    <Card className="space-y-3">
      <h2 className="text-lg text-ink">Добавить замок</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm text-dark-gray">Замок TTLock</span>
          <select
            value={ttlockLockId}
            onChange={(e) => {
              setTtlockLockId(e.target.value);
              const l = ttlocks.find((x) => x.ttlockLockId === e.target.value);
              if (l && !name) setName(l.name);
            }}
            className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm"
          >
            <option value="">— ({ttlocks.length} из TTLock)</option>
            {ttlocks.map((l) => (
              <option key={l.ttlockLockId} value={l.ttlockLockId}>
                {l.name} (#{l.ttlockLockId}){l.hasGateway ? ' · шлюз' : ''}
              </option>
            ))}
          </select>
        </label>
        <Input id="lockname" label="Название двери" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="block">
          <span className="mb-1.5 block text-sm text-dark-gray">Тип двери</span>
          <select value={target} onChange={(e) => onTarget(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
            {TARGETS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        {!isRoomDoor && (
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Зона покрытия</span>
            <select
              value={coverage}
              onChange={(e) => setCoverage(e.target.value as LockCoverage)}
              className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm"
            >
              <option value="PROPERTY">Весь объект</option>
              <option value="FLOOR">Этаж</option>
              <option value="ROOM_LIST">Список номеров</option>
            </select>
          </label>
        )}
      </div>

      {isRoomDoor && (
        <label className="block max-w-sm">
          <span className="mb-1.5 block text-sm text-dark-gray">Номер</span>
          <select value={singleRoom} onChange={(e) => setSingleRoom(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
            <option value="">— выберите номер —</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.number}{r.floor ? ` · эт.${r.floor}` : ''}</option>
            ))}
          </select>
        </label>
      )}

      {!isRoomDoor && coverage === 'FLOOR' && (
        <label className="block max-w-xs">
          <span className="mb-1.5 block text-sm text-dark-gray">Этаж</span>
          <select value={coverageFloor} onChange={(e) => setCoverageFloor(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm">
            <option value="">— выберите этаж —</option>
            {floors.map((f) => (
              <option key={f} value={f}>Этаж {f}</option>
            ))}
          </select>
        </label>
      )}

      {!isRoomDoor && coverage === 'ROOM_LIST' && (
        <RoomPicker rooms={rooms} floors={floors} selected={roomSet} onChange={setRoomSet} />
      )}

      <div className="flex items-center gap-3">
        <Button onClick={() => void create()} disabled={busy}>Добавить</Button>
        {msg && <span className="text-sm text-ink">{msg}</span>}
      </div>
    </Card>
  );
}

function LockRow({
  lock,
  rooms,
  floors,
  roomName,
  onChanged,
}: {
  lock: DbLock;
  rooms: PmsRoom[];
  floors: string[];
  roomName: Map<string, string>;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [coverage, setCoverage] = useState<LockCoverage>(lock.coverage);
  const [coverageFloor, setCoverageFloor] = useState(lock.coverageFloor ?? '');
  const [roomSet, setRoomSet] = useState<Set<string>>(new Set(lock.roomLinks.map((r) => r.roomId)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setMsg(null);
    if (coverage === 'FLOOR' && !coverageFloor) return setMsg('Выберите этаж');
    if ((coverage === 'ROOM' || coverage === 'ROOM_LIST') && roomSet.size === 0)
      return setMsg('Выберите номер(а)');
    setBusy(true);
    try {
      await adminApi.setLockCoverage(lock.id, {
        coverage,
        coverageFloor: coverage === 'FLOOR' ? coverageFloor : undefined,
        roomIds: coverage === 'ROOM' || coverage === 'ROOM_LIST' ? [...roomSet] : undefined,
      });
      setEditing(false);
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-t border-ink/10 pt-3 first:border-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-ink">
          {lock.name}{' '}
          <span className="text-xs text-dark-gray">
            · {COVERAGE_LABEL[lock.coverage]} · {coverageSummary(lock, roomName)} · TTLock #{lock.ttlockLockId}
            {lock.hasGateway ? ' · шлюз' : ''}
          </span>
        </p>
        <button onClick={() => setEditing((v) => !v)} className="text-sm text-primary underline">
          {editing ? 'свернуть' : 'изменить покрытие'}
        </button>
      </div>

      {editing && (
        <div className="mt-2 space-y-3 rounded-lg border border-ink/10 bg-beige/30 p-3">
          <label className="block max-w-xs">
            <span className="mb-1.5 block text-sm text-dark-gray">Зона покрытия</span>
            <select
              value={coverage}
              onChange={(e) => setCoverage(e.target.value as LockCoverage)}
              className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm"
            >
              <option value="ROOM">Дверь номера (один номер)</option>
              <option value="PROPERTY">Весь объект</option>
              <option value="FLOOR">Этаж</option>
              <option value="ROOM_LIST">Список номеров</option>
            </select>
          </label>

          {coverage === 'FLOOR' && (
            <label className="block max-w-xs">
              <span className="mb-1.5 block text-sm text-dark-gray">Этаж</span>
              <select value={coverageFloor} onChange={(e) => setCoverageFloor(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
                <option value="">— выберите этаж —</option>
                {floors.map((f) => (
                  <option key={f} value={f}>Этаж {f}</option>
                ))}
              </select>
            </label>
          )}

          {(coverage === 'ROOM' || coverage === 'ROOM_LIST') && (
            <RoomPicker
              rooms={rooms}
              floors={floors}
              selected={roomSet}
              onChange={(next) => {
                // Для личной двери оставляем только один (только что выбранный) номер.
                if (coverage === 'ROOM' && next.size > 1) {
                  const added = [...next].find((id) => !roomSet.has(id));
                  setRoomSet(new Set(added ? [added] : [...next].slice(0, 1)));
                } else {
                  setRoomSet(next);
                }
              }}
            />
          )}

          <div className="flex items-center gap-3">
            <Button onClick={() => void save()} disabled={busy}>Сохранить</Button>
            {msg && <span className="text-sm text-ink">{msg}</span>}
          </div>
        </div>
      )}

      <LockConsole ttlockLockId={lock.ttlockLockId} />
    </div>
  );
}

/** Учётная запись TTLock (личный кабинет). */
function TtlockCredsCard() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [source, setSource] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = () =>
    adminApi.ttlockCreds().then((c) => {
      setUsername(c.username);
      setSource(c.source);
    }).catch(() => undefined);
  useEffect(() => { void load(); }, []);

  async function save() {
    setMsg(null);
    try {
      await adminApi.setTtlockCreds(username.trim(), password || undefined);
      setPassword('');
      setMsg('Сохранено. Кэш токена сброшен — следующий запрос использует новую учётку.');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка');
    }
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-lg text-ink">Учётная запись TTLock (личный кабинет)</h2>
      <p className="text-sm text-dark-gray">
        Логин/пароль аккаунта-владельца замков. Источник сейчас: <b>{source === 'settings' ? 'из админки' : 'из .env'}</b>.
        Пароль не отображается; оставьте поле пустым, чтобы не менять.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input id="ttu" label="Логин (телефон/почта)" value={username} onChange={(e) => setUsername(e.target.value)} />
        <Input id="ttp" label="Новый пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button onClick={() => void save()}>Сохранить учётку</Button>
      {msg && <p className="text-sm text-ink">{msg}</p>}
    </Card>
  );
}

/** Пульт TTLock по конкретному замку: открыть, пароль, eKey, журнал. */
function LockConsole({ ttlockLockId }: { ttlockLockId: string }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(toLocalInput(new Date()));
  const [end, setEnd] = useState(toLocalInput(new Date(Date.now() + 86_400_000)));
  const [pName, setPName] = useState('D H&A');
  const [pMode, setPMode] = useState<'get' | 'add'>('get');
  const [pin, setPin] = useState('');
  const [receiver, setReceiver] = useState('');
  const [records, setRecords] = useState<LockRecord[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ms = (s: string) => new Date(s).getTime();

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-1 text-sm text-primary underline">
        Пульт TTLock ▾
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-4 rounded-lg border border-ink/10 bg-beige/30 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">Пульт TTLock · замок #{ttlockLockId}</span>
        <button onClick={() => setOpen(false)} className="text-sm text-dark-gray underline">свернуть</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => void run(async () => { await adminApi.ttlockUnlock(ttlockLockId); setMsg('Команда на открытие отправлена'); })} disabled={busy}>
          Открыть удалённо
        </Button>
        <Button variant="secondary" onClick={() => void run(async () => { setRecords(await adminApi.ttlockRecords(ttlockLockId)); })} disabled={busy}>
          Журнал входов
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block text-sm text-dark-gray">Действует с
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="mt-1 w-full rounded-md border border-ink/20 px-2 py-1.5 text-sm" />
        </label>
        <label className="block text-sm text-dark-gray">по
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="mt-1 w-full rounded-md border border-ink/20 px-2 py-1.5 text-sm" />
        </label>
      </div>

      {/* Пароль */}
      <div className="rounded-md border border-ink/10 bg-white p-3">
        <p className="mb-2 text-sm font-medium text-ink">Временный пароль</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input id={`pn-${ttlockLockId}`} label="Название" value={pName} onChange={(e) => setPName(e.target.value)} />
          <label className="block">
            <span className="mb-1.5 block text-sm text-dark-gray">Режим</span>
            <select value={pMode} onChange={(e) => setPMode(e.target.value as 'get' | 'add')} className="w-full rounded-md border border-ink/20 bg-white px-2 py-2.5 text-sm">
              <option value="get">Сгенерировать (без шлюза)</option>
              <option value="add">Свой код (нужен шлюз/BT)</option>
            </select>
          </label>
          {pMode === 'add' && <Input id={`pin-${ttlockLockId}`} label="Свой код" value={pin} onChange={(e) => setPin(e.target.value)} />}
        </div>
        <Button
          className="mt-2"
          disabled={busy}
          onClick={() => void run(async () => {
            const r = await adminApi.ttlockPasscode({ ttlockLockId, name: pName, mode: pMode, pin: pMode === 'add' ? pin : undefined, startMs: ms(start), endMs: ms(end) });
            setMsg(`Пароль создан: ${r.pin}`);
          })}
        >
          Создать пароль
        </Button>
      </div>

      {/* eKey */}
      <div className="rounded-md border border-ink/10 bg-white p-3">
        <p className="mb-2 text-sm font-medium text-ink">Отправить eKey</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Input id={`rk-${ttlockLockId}`} label="Аккаунт получателя в TTLock" value={receiver} onChange={(e) => setReceiver(e.target.value)} />
          <div className="flex items-end">
            <Button
              disabled={busy || !receiver.trim()}
              onClick={() => void run(async () => {
                const r = await adminApi.ttlockEkey({ ttlockLockId, receiverUsername: receiver.trim(), name: pName, startMs: ms(start), endMs: ms(end) });
                setMsg(`eKey отправлен (id ${r.keyId})`);
              })}
            >
              Отправить eKey
            </Button>
          </div>
        </div>
      </div>

      {msg && <p className="text-sm text-ink">{msg}</p>}

      {records && (
        <div className="rounded-md border border-ink/10 bg-white p-3">
          <p className="mb-2 text-sm font-medium text-ink">Журнал входов ({records.length})</p>
          {records.length === 0 && <p className="text-sm text-dark-gray">Записей нет.</p>}
          <div className="space-y-1">
            {records.map((r, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-ink">{r.type} · {r.who}</span>
                <span className="text-dark-gray">{r.at ? new Date(r.at).toLocaleString('ru') : '—'} {r.success ? '✓' : '✗'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
