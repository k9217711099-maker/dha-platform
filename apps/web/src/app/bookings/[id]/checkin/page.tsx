'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, Input } from '@dha/ui';
import { api } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth-context';
import type { CheckinStatus, CheckinView } from '../../../../lib/api-types';

const STATUS_LABEL: Record<CheckinStatus, string> = {
  NOT_STARTED: 'не начата',
  DRAFT: 'черновик',
  SUBMITTED: 'отправлена',
  UNDER_REVIEW: 'на проверке',
  APPROVED: 'подтверждена',
  REJECTED: 'отклонена',
  NEEDS_FIX: 'требует исправления',
};

export default function CheckinPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { guest, loading } = useAuth();

  const [c, setC] = useState<CheckinView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Поля формы
  const [arrivalTime, setArrival] = useState('14:00');
  const [departureTime, setDeparture] = useState('12:00');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState<number[]>([]);
  const [series, setSeries] = useState('');
  const [number, setNumber] = useState('');
  const [consents, setConsents] = useState(false);
  const [houseRules, setHouseRules] = useState(false);
  const [fileMain, setFileMain] = useState<File | null>(null);
  const [fileReg, setFileReg] = useState<File | null>(null);

  useEffect(() => {
    if (!loading && !guest) router.replace('/login');
  }, [loading, guest, router]);

  useEffect(() => {
    if (guest) {
      api
        .getCheckin(id)
        .then((data) => {
          setC(data);
          setArrival(data.arrivalTime ?? '14:00');
          setDeparture(data.departureTime ?? '12:00');
          setAdults(data.adults);
          setChildren((data.children ?? []).map((ch) => ch.age));
          setConsents(data.consentsSigned);
          setHouseRules(data.houseRulesAccepted);
        })
        .catch(() => setError('Регистрация недоступна'));
    }
  }, [guest, id]);

  if (loading || !guest || !c) {
    return <main className="mx-auto max-w-2xl px-6 py-16 text-dark-gray">Загрузка…</main>;
  }

  const editable = ['DRAFT', 'NEEDS_FIX', 'REJECTED', 'NOT_STARTED'].includes(c.status);

  async function run(fn: () => Promise<CheckinView | void>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      if (res) setC(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(() =>
      api.saveCheckin(id, {
        arrivalTime,
        departureTime,
        adults,
        children: children.map((age) => ({ age })),
        passport: series && number ? { series, number } : undefined,
        consentsSigned: consents,
        houseRulesAccepted: houseRules,
      }),
    );

  const uploadPage = (page: 'main' | 'registration') =>
    run(async () => {
      const f = page === 'main' ? fileMain : fileReg;
      if (!f) throw new Error('Выберите файл');
      await api.uploadPassport(id, f, page);
      return api.getCheckin(id);
    });

  const submit = () => run(() => api.submitCheckin(id));

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-6 py-10">
      <div>
        <h1 className="text-3xl font-light text-ink">Онлайн-регистрация</h1>
        <p className="mt-1 text-sm text-dark-gray">
          Статус: <span className="text-ink">{STATUS_LABEL[c.status]}</span>
        </p>
      </div>

      {c.status === 'APPROVED' && c.instructions && (
        <Card>
          <p className="text-ink">{c.instructions}</p>
        </Card>
      )}
      {(c.status === 'REJECTED' || c.status === 'NEEDS_FIX') && c.rejectionReason && (
        <Card>
          <p className="text-sm text-red-700">Замечание: {c.rejectionReason}</p>
        </Card>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {(c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW') && (
        <Card>
          <p className="text-dark-gray">Регистрация отправлена и проверяется администратором.</p>
        </Card>
      )}

      {editable && (
        <>
          <Card className="space-y-3">
            <h2 className="text-lg text-ink">Время и состав</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input id="arr" label="Время заезда" type="time" value={arrivalTime} onChange={(e) => setArrival(e.target.value)} />
              <Input id="dep" label="Время выезда" type="time" value={departureTime} onChange={(e) => setDeparture(e.target.value)} />
            </div>
            <Input id="adults" label="Взрослых" type="number" min={1} value={adults} onChange={(e) => setAdults(Number(e.target.value))} />
            <div>
              <p className="mb-1 text-sm text-dark-gray">Дети (возраст)</p>
              <div className="flex flex-wrap items-center gap-2">
                {children.map((age, i) => (
                  <input
                    key={i}
                    type="number"
                    min={0}
                    max={17}
                    value={age}
                    onChange={(e) =>
                      setChildren(children.map((a, j) => (j === i ? Number(e.target.value) : a)))
                    }
                    className="w-16 rounded-md border border-ink/20 px-2 py-1 text-sm"
                  />
                ))}
                <button onClick={() => setChildren([...children, 0])} className="text-sm text-ink underline">
                  + ребёнок
                </button>
                {children.length > 0 && (
                  <button onClick={() => setChildren(children.slice(0, -1))} className="text-sm text-dark-gray underline">
                    убрать
                  </button>
                )}
              </div>
            </div>
          </Card>

          <Card className="space-y-3">
            <h2 className="text-lg text-ink">Паспортные данные</h2>
            <p className="text-xs text-dark-gray">Данные хранятся в зашифрованном виде (152-ФЗ).</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input id="series" label="Серия" value={series} onChange={(e) => setSeries(e.target.value)} />
              <Input id="number" label="Номер" value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <p className="text-sm text-dark-gray">Нужны две страницы паспорта:</p>
            <div className={`rounded-lg border p-3 ${c.hasMainPage ? 'border-emerald-300 bg-emerald-50/40' : 'border-ink/15'}`}>
              <p className="text-sm text-ink">1) Разворот с фотографией {c.hasMainPage ? '✓ загружено' : ''}</p>
              <p className="mb-2 text-xs text-dark-gray">Страницы 2–3: фото, ФИО, серия и номер.</p>
              <input type="file" accept="image/*,application/pdf"
                onChange={(e) => setFileMain(e.target.files?.[0] ?? null)} className="text-sm" />
              <Button variant="secondary" onClick={() => void uploadPage('main')} disabled={busy || !fileMain} className="ml-2">
                Загрузить
              </Button>
            </div>
            <div className={`rounded-lg border p-3 ${c.hasRegistrationPage ? 'border-emerald-300 bg-emerald-50/40' : 'border-ink/15'}`}>
              <p className="text-sm text-ink">2) Страница с регистрацией (пропиской) {c.hasRegistrationPage ? '✓ загружено' : ''}</p>
              <p className="mb-2 text-xs text-dark-gray">Страница со штампом «Место жительства» — для адреса регистрации.</p>
              <input type="file" accept="image/*,application/pdf"
                onChange={(e) => setFileReg(e.target.files?.[0] ?? null)} className="text-sm" />
              <Button variant="secondary" onClick={() => void uploadPage('registration')} disabled={busy || !fileReg} className="ml-2">
                Загрузить
              </Button>
            </div>
          </Card>

          <Card className="space-y-2">
            <label className="flex items-start gap-2 text-sm text-dark-gray">
              <input type="checkbox" checked={consents} onChange={(e) => setConsents(e.target.checked)} className="mt-0.5" />
              <span>Подписываю согласия на обработку данных регистрации.</span>
            </label>
            <label className="flex items-start gap-2 text-sm text-dark-gray">
              <input type="checkbox" checked={houseRules} onChange={(e) => setHouseRules(e.target.checked)} className="mt-0.5" />
              <span>Подтверждаю правила проживания.</span>
            </label>
          </Card>

          {(!c.hasMainPage || !c.hasRegistrationPage) && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Чтобы отправить на проверку: {[!c.hasMainPage && 'загрузите разворот с фото', !c.hasRegistrationPage && 'загрузите страницу с регистрацией'].filter(Boolean).join(', ')}.
            </p>
          )}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => void save()} disabled={busy}>
              Сохранить черновик
            </Button>
            <Button onClick={() => void submit()} disabled={busy || !c.hasMainPage || !c.hasRegistrationPage}>
              Отправить на проверку
            </Button>
          </div>
        </>
      )}
    </main>
  );
}
