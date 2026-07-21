'use client';

/**
 * Гостевой портал заселения (CHECK-IN-TZ §4) — доступ по magic-link, БЕЗ аккаунта.
 * Один экран ведёт гостя по воронке: данные заезда → онлайн-регистрация → оплата →
 * цифровой ключ. Тексты шагов приходят из конструктора воронки (guestDescription).
 */
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button, Card, Input } from '@dha/ui';
import type { CheckinView, KeysView, SaveCheckinInput } from '../../../../lib/api-types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

interface PortalContext {
  booking: {
    id: string;
    bookingNumber: string | null;
    status: string;
    checkIn: string;
    checkOut: string;
    guests: number;
    totalPrice: number;
    paymentStatus: string;
    property: { name: string; address: string; checkInTime: string | null; checkOutTime: string | null };
    roomTypeName: string | null;
    guestName: string | null;
  };
  /** Инструкция по заселению (каскад: номер → объект); null до прохождения шлюзов. */
  instructions: string | null;
  /** Адрес юнита (апартаменты); null до прохождения шлюзов. */
  unitAddress: string | null;
  /** Фото-инструкция номера (апартаменты); пусто до прохождения шлюзов. */
  instructionPhotos: string[];
  stage: string;
  gates: { key: string; ok: boolean; reason: string | null }[];
  window: { start: string; end: string };
  checkin: CheckinView;
  payment: { remaining: number; prepayment: number } | null;
  stages: { key: string; title: string; order: number; guestDescription: string | null }[];
}

async function portal<T>(token: string, path = '', init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/s/checkin/${token}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { message?: string | string[] };
  if (!res.ok) {
    const m = data?.message;
    throw new Error(Array.isArray(m) ? m.join(', ') : (m ?? 'Ошибка'));
  }
  return data;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });

export default function GuestCheckinPortal() {
  const { token } = useParams<{ token: string }>();
  const [ctx, setCtx] = useState<PortalContext | null>(null);
  const [keys, setKeys] = useState<KeysView | null>(null);
  const [dead, setDead] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lockOpened, setLockOpened] = useState(false);

  const reload = useCallback(() => {
    portal<PortalContext>(token)
      .then((c) => {
        setCtx(c);
        return portal<KeysView>(token, '/key').then(setKeys).catch(() => undefined);
      })
      .catch(() => setDead(true));
  }, [token]);
  useEffect(() => { reload(); }, [reload]);

  if (dead) {
    return (
      <main className="mx-auto max-w-xl px-6 py-20 text-center">
        <h1 className="text-2xl font-light text-ink">Ссылка недействительна</h1>
        <p className="mt-2 text-sm text-dark-gray">Срок действия ссылки истёк или она была отозвана. Запросите новую у отеля.</p>
      </main>
    );
  }
  if (!ctx) return <main className="mx-auto max-w-xl px-6 py-20 text-dark-gray">Загрузка…</main>;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await fn(); reload(); } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };

  /** Открыть замок дистанционно + показать подтверждающий попап. */
  const openLock = (lockId: string) => {
    setBusy(true); setError(null);
    portal(token, '/key/open', { method: 'POST', body: JSON.stringify({ lockId }) })
      .then(() => { setLockOpened(true); reload(); })
      .catch((e) => setError(e instanceof Error ? e.message : 'Не удалось открыть замок'))
      .finally(() => setBusy(false));
  };

  const b = ctx.booking;
  const desc = (key: string) => ctx.stages.find((s) => s.key === key)?.guestDescription;
  const paid = b.paymentStatus === 'PAID';
  const regDone = ['SUBMITTED', 'UNDER_REVIEW', 'APPROVED'].includes(ctx.checkin.status);

  return (
    <main className="mx-auto max-w-xl space-y-5 px-6 py-10">
      {/* Сводка брони */}
      <div>
        <p className="text-xs uppercase tracking-widest text-dark-gray">Онлайн-заселение</p>
        <h1 className="mt-1 text-3xl font-light text-ink">{b.property.name}</h1>
        <p className="mt-1 text-sm text-dark-gray">
          {b.property.address} · {fmtDate(b.checkIn)} — {fmtDate(b.checkOut)}
          {b.roomTypeName ? ` · ${b.roomTypeName}` : ''} · гостей: {b.guests}
        </p>
        {b.guestName ? <p className="mt-0.5 text-sm text-dark-gray">Гость: {b.guestName} · бронь № {b.bookingNumber ?? '—'}</p> : null}
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {/* Шаг: онлайн-регистрация */}
      <StepCard n={1} title="Онлайн-регистрация" done={ctx.checkin.status === 'APPROVED'} hint={desc('registration')}>
        {ctx.checkin.status === 'APPROVED' ? (
          <p className="text-sm text-emerald-700">Регистрация подтверждена.</p>
        ) : regDone ? (
          <p className="text-sm text-dark-gray">Анкета отправлена и проверяется администратором.</p>
        ) : (
          <RegistrationForm token={token} checkin={ctx.checkin} busy={busy} run={run} />
        )}
        {ctx.checkin.rejectionReason && !regDone ? (
          <p className="mt-2 text-sm text-red-700">Замечание администратора: {ctx.checkin.rejectionReason}</p>
        ) : null}
      </StepCard>

      {/* Шаг: оплата */}
      <StepCard n={2} title="Оплата" done={paid} hint={desc('payment')}>
        {paid ? (
          <p className="text-sm text-emerald-700">Проживание оплачено.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-dark-gray">К оплате: <span className="text-ink">{(ctx.payment?.remaining ?? b.totalPrice).toLocaleString('ru-RU')} ₽</span></p>
            <Button disabled={busy} onClick={() => void run(async () => {
              const r = await portal<{ confirmationUrl?: string; error?: string }>(token, '/pay', { method: 'POST' });
              if (r.error) throw new Error(r.error);
              if (r.confirmationUrl) window.location.href = r.confirmationUrl;
            })}>Оплатить онлайн</Button>
          </div>
        )}
      </StepCard>

      {/* Шаг: цифровой ключ */}
      <StepCard n={3} title="Цифровой ключ" done={Boolean(keys?.doors.some((d) => d.status === 'ACTIVE'))} hint={desc('key_issue')}>
        {!keys ? <p className="text-sm text-dark-gray">Проверяем условия…</p> : keys.eligible ? (
          <div className="space-y-3">
            {keys.doors.some((d) => d.status === 'ACTIVE') ? null : (
              <Button disabled={busy} onClick={() => void run(() => portal(token, '/key', { method: 'POST' }))}>Получить ключ</Button>
            )}
            {keys.doors.filter((d) => d.status === 'ACTIVE').map((d) => (
              <div key={d.ttlockLockId} className="flex items-center justify-between rounded-lg border border-ink/10 px-3 py-2">
                <div>
                  <p className="text-sm text-ink">{d.doorName}</p>
                  {d.pin ? <p className="font-mono text-xl tracking-widest text-ink">{d.pin}</p> : <p className="text-xs text-dark-gray">PIN появится в окне действия</p>}
                </div>
                {d.canRemoteOpen ? (
                  <button type="button" disabled={busy} onClick={() => openLock(d.ttlockLockId)}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                    </svg>
                    Открыть
                  </button>
                ) : null}
              </div>
            ))}
            {keys.validFrom ? (
              <p className="text-xs text-dark-gray">
                Действует: {new Date(keys.validFrom).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} — {keys.validUntil ? new Date(keys.validUntil).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
              </p>
            ) : null}
          </div>
        ) : (
          <ul className="space-y-1">
            {keys.reasons.map((r, i) => <li key={i} className="text-sm text-dark-gray">· {r}</li>)}
          </ul>
        )}
      </StepCard>

      {/* Как заселиться: инструкция юнита/объекта — только после прохождения шлюзов */}
      {ctx.instructions || ctx.unitAddress || ctx.instructionPhotos?.length ? (
        <Card className="space-y-2">
          <h2 className="text-lg text-ink">Как заселиться</h2>
          {ctx.unitAddress ? <p className="text-sm text-ink">Адрес: {ctx.unitAddress}</p> : null}
          {ctx.instructions ? <p className="whitespace-pre-line text-sm text-dark-gray">{ctx.instructions}</p> : null}
          {ctx.instructionPhotos?.length ? (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {ctx.instructionPhotos.map((url, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={/^https?:\/\//.test(url) ? url : `${API_BASE.replace(/\/api$/, '')}${url}`}
                  alt={`Фото-инструкция ${i + 1}`} className="w-full rounded-lg border border-ink/10 object-cover" />
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

      <p className="pb-6 text-center text-xs text-dark-gray">
        D Hotels & Apartments · бронируйте напрямую и получайте баллы D
      </p>

      {/* Попап подтверждения открытия замка */}
      {lockOpened ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={() => setLockOpened(false)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-6 text-center shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
              <svg viewBox="0 0 24 24" className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                <path d="M9 16.5l2 2 4-4" />
              </svg>
            </div>
            <p className="text-lg font-medium text-ink">Замок открыт</p>
            <p className="mt-1 text-sm text-dark-gray">Дверь разблокирована. Приятного отдыха!</p>
            <button type="button" onClick={() => setLockOpened(false)} className="mt-4 rounded-lg bg-ink px-4 py-2 text-sm text-white">
              Готово
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function StepCard({ n, title, done, hint, children }: {
  n: number; title: string; done: boolean; hint?: string | null; children: React.ReactNode;
}) {
  return (
    <Card className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${done ? 'bg-emerald-500 text-white' : 'bg-ink/10 text-ink'}`}>
          {done ? '✓' : n}
        </span>
        <h2 className="text-lg text-ink">{title}</h2>
      </div>
      {hint ? <p className="text-xs text-dark-gray">{hint}</p> : null}
      {children}
    </Card>
  );
}

/** Анкета регистрации — та же, что в ЛК, но через токен-эндпоинты. */
function RegistrationForm({ token, checkin, busy, run }: {
  token: string; checkin: CheckinView; busy: boolean; run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [arrivalTime, setArrival] = useState(checkin.arrivalTime ?? '14:00');
  const [adults, setAdults] = useState(checkin.adults);
  const [series, setSeries] = useState('');
  const [number, setNumber] = useState('');
  const [consents, setConsents] = useState(checkin.consentsSigned);
  const [houseRules, setHouseRules] = useState(checkin.houseRulesAccepted);
  const [file, setFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState(false);
  const [recog, setRecog] = useState<{ ok: boolean; text: string } | null>(null);

  const save = (): Promise<unknown> => {
    const body: SaveCheckinInput = {
      arrivalTime,
      adults,
      passport: series && number ? { series, number } : undefined,
      consentsSigned: consents,
      houseRulesAccepted: houseRules,
    };
    return portal(token, '/registration', { method: 'PUT', body: JSON.stringify(body) });
  };

  const uploadOnly = async () => {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE}/s/checkin/${token}/passport`, { method: 'POST', body: fd });
    if (!res.ok) throw new Error('Не удалось загрузить скан');
    setUploaded(true);
  };

  /** Шаг 1: загрузить скан и распознать → автозаполнить серию/номер. */
  const uploadAndRecognize = async () => {
    if (!file) throw new Error('Выберите файл скана паспорта');
    setRecog(null);
    await save(); // регистрация должна существовать, чтобы привязать скан
    await uploadOnly();
    try {
      const r = await portal<{ fields: { series?: string; number?: string } }>(
        token,
        '/passport/recognize',
        { method: 'POST' },
      );
      const got = Boolean(r.fields.series || r.fields.number);
      if (r.fields.series) setSeries(r.fields.series);
      if (r.fields.number) setNumber(r.fields.number);
      setRecog({
        ok: got,
        text: got
          ? 'Паспорт распознан — проверьте поля ниже и при необходимости поправьте.'
          : 'Скан загружен. Автораспознавание недоступно — заполните серию и номер вручную.',
      });
    } catch {
      setRecog({ ok: false, text: 'Скан загружен. Заполните серию и номер вручную.' });
    }
  };

  return (
    <div className="space-y-3">
      {/* Шаг 1 — скан паспорта: серия/номер подставятся автоматически */}
      <div className="rounded-lg border border-ink/10 p-3">
        <p className="text-sm text-ink">Шаг 1. Скан или фото паспорта {checkin.documentsCount > 0 ? `(загружено: ${checkin.documentsCount})` : ''}</p>
        <p className="mb-2 mt-0.5 text-xs text-dark-gray">Загрузите разворот паспорта — серию и номер подставим автоматически, останется проверить. Данные шифруются.</p>
        <input type="file" accept="image/*,application/pdf"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setUploaded(false); setRecog(null); }}
          className="text-sm" />
        <div className="mt-2">
          <Button variant="secondary" disabled={busy || !file} onClick={() => void run(uploadAndRecognize)}>
            Загрузить и распознать
          </Button>
        </div>
        {recog ? <p className={`mt-2 text-xs ${recog.ok ? 'text-emerald-700' : 'text-dark-gray'}`}>{recog.text}</p> : null}
      </div>

      {/* Шаг 2 — данные паспорта (автозаполнены, можно поправить) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input id="p-series" label="Паспорт: серия" value={series} onChange={(e) => setSeries(e.target.value)} />
        <Input id="p-number" label="Паспорт: номер" value={number} onChange={(e) => setNumber(e.target.value)} />
      </div>

      {/* Шаг 3 — данные заезда */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input id="p-arr" label="Время заезда" type="time" value={arrivalTime} onChange={(e) => setArrival(e.target.value)} />
        <Input id="p-adults" label="Взрослых" type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
      </div>

      <label className="flex items-start gap-2 text-sm text-dark-gray">
        <input type="checkbox" checked={consents} onChange={(e) => setConsents(e.target.checked)} className="mt-0.5" />
        <span>Подписываю согласия на обработку персональных данных.</span>
      </label>
      <label className="flex items-start gap-2 text-sm text-dark-gray">
        <input type="checkbox" checked={houseRules} onChange={(e) => setHouseRules(e.target.checked)} className="mt-0.5" />
        <span>Подтверждаю правила проживания.</span>
      </label>
      <div className="flex gap-2">
        <Button variant="secondary" disabled={busy} onClick={() => void run(async () => { await save(); if (file && !uploaded) await uploadOnly(); })}>
          Сохранить
        </Button>
        <Button disabled={busy} onClick={() => void run(async () => {
          await save();
          if (file && !uploaded) await uploadOnly();
          await portal(token, '/registration/submit', { method: 'POST' });
        })}>
          Отправить на проверку
        </Button>
      </div>
    </div>
  );
}
