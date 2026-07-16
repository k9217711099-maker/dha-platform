'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Button, Card, Input } from '@dha/ui';
import { adminApi, type Extra, type MarketingKind, type MarketingOption, type PmsBooking, type PmsRatePlan, type PmsRateCalendarCell, type PmsRoom, type PmsRoomBlock, type PmsRoomOption, type Promocode, type RestrictionGrid } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';
import { DateRangePicker } from '../../../components/DateRangePicker';
import { TariffForm } from './TariffForm';
import { useEsc } from '../../../lib/use-esc';

type Tab = 'plans' | 'restrictions' | 'promocodes';
type NamedId = { id: string; name: string };
const selectCls = 'w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm';
const rub = (n: number | null) => (n === null ? '—' : `${n.toLocaleString('ru-RU')} ₽`);

/** Сплошная (непрозрачная) панель модалки — Card даёт bg-white/70 и «просвечивает». */
function ModalShell({ children, onClose, wide }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEsc(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-6" onClick={onClose}>
      <div className={`my-4 w-full ${wide ? 'max-w-3xl' : 'max-w-2xl'} rounded-xl border border-ink/10 bg-white p-6 shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

/** Обёртка для группы <tr> без лишнего DOM-узла внутри <tbody>. */
function FragmentRows({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** Тумблер вкл/выкл. */
function Toggle({ on, onClick, title }: { on: boolean; onClick: () => void; title: string }) {
  return (
    <button type="button" title={title} onClick={onClick}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-ink/20'}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}

export default function PmsRatesPage() {
  const ready = useRequireAdmin();
  const [tab, setTab] = useState<Tab>('plans');
  const [options, setOptions] = useState<PmsRoomOption[]>([]);
  const [plans, setPlans] = useState<PmsRatePlan[]>([]);
  const [error, setError] = useState('');

  const loadPlans = () => adminApi.pmsRatePlans().then(setPlans).catch(() => undefined);
  useEffect(() => {
    if (!ready) return;
    void adminApi.pmsRoomOptions().then(setOptions);
    void loadPlans();
  }, [ready]);

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">PMS · Тарифы и ограничения</h1>
      <p className="mb-5 text-sm text-dark-gray">Все тарифы сети списком; ограничения по категориям и промокоды — в соседних вкладках.</p>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-ink/5 p-1">
          {([['plans', 'Все тарифы'], ['restrictions', 'Массовое ограничение продаж'], ['promocodes', 'Промокоды']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`rounded-md px-4 py-1.5 text-sm transition ${tab === t ? 'bg-white font-medium text-ink shadow-sm' : 'text-dark-gray hover:text-ink'}`}>{label}</button>
          ))}
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      {tab === 'plans' && <PlansTab options={options} plans={plans} onChanged={loadPlans} onError={setError} />}
      {tab === 'restrictions' && <RestrictionsTab options={options} plans={plans} />}
      {tab === 'promocodes' && <PromocodesTab options={options} plans={plans} onError={setError} />}
    </main>
  );
}

// ─────────── Вкладка «Все тарифы» ───────────
function PlansTab({ options, plans, onChanged, onError }: { options: PmsRoomOption[]; plans: PmsRatePlan[]; onChanged: () => void; onError: (m: string) => void }) {
  const [tariffForm, setTariffForm] = useState<PmsRatePlan | 'new' | null>(null);
  const [editPlan, setEditPlan] = useState('');
  const propName = (id: string | null) => (id ? options.find((o) => o.id === id)?.name ?? '' : 'Вся сеть');
  const allRoomTypes = useMemo<NamedId[]>(() => options.flatMap((o) => o.roomTypes.map((rt) => ({ id: rt.id, name: `${o.name} · ${rt.name}` }))), [options]);
  // Сетевой тариф (propertyId=null) → все категории сети; иначе — категории объекта.
  // Если propertyId «осиротел» (объект пересоздан импортом и id больше не совпадает),
  // не оставляем список категорий пустым — показываем все категории сети.
  const roomTypesOf = (propertyId: string | null) => {
    if (!propertyId) return allRoomTypes;
    const own = options.find((o) => o.id === propertyId)?.roomTypes;
    return own && own.length ? own : allRoomTypes;
  };

  const toggle = (p: PmsRatePlan, patch: Partial<Pick<PmsRatePlan, 'availableFrontDesk' | 'availableBookingModule' | 'availableOta' | 'active'>>) => {
    onError('');
    void adminApi.pmsUpdateRatePlan(p.id, patch).then(onChanged).catch((e) => onError(e instanceof Error ? e.message : 'Ошибка'));
  };

  return (
    <div>
      <div className="mb-4"><Button onClick={() => setTariffForm('new')}>+ Создать тариф</Button></div>

      {plans.length === 0 ? <p className="text-sm text-dark-gray">Тарифов нет.</p> : null}
      <div className="space-y-2">
        {plans.map((p) => (
          <Card key={p.id} className="!p-0">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-[220px] flex-1">
                <span className="text-ink">{p.name}</span>
                <span className="ml-2 rounded bg-ink/10 px-1.5 py-0.5 text-xs text-dark-gray">{p.code}</span>
                {!p.refundable ? <span className="ml-2 text-xs text-dark-gray">невозвр.</span> : null}
                {p.parentRatePlanId ? <span className="ml-2 text-xs text-sky-700">производный {p.adjustmentType === 'PERCENT' ? `${p.adjustmentValue}%` : `${p.adjustmentValue}₽`}</span> : null}
                <span className="ml-2 rounded bg-ink/5 px-1.5 py-0.5 text-xs text-ink/50">{propName(p.propertyId)}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-xs text-dark-gray" title="Бронирование у стойки">Стойка<Toggle on={p.availableFrontDesk} onClick={() => toggle(p, { availableFrontDesk: !p.availableFrontDesk })} title="Стойка" /></span>
                <span className="flex items-center gap-1.5 text-xs text-dark-gray" title="Модуль бронирования на сайте">Модуль<Toggle on={p.availableBookingModule} onClick={() => toggle(p, { availableBookingModule: !p.availableBookingModule })} title="Модуль" /></span>
                <span className="flex items-center gap-1.5 text-xs text-dark-gray" title="Каналы продаж (OTA)">OTA<Toggle on={p.availableOta} onClick={() => toggle(p, { availableOta: !p.availableOta })} title="OTA" /></span>
              </div>
              <button type="button" title="Настройки тарифа" onClick={() => setTariffForm(p)}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-ink/20 text-ink hover:border-ink/40" aria-label="Настройки тарифа">✎</button>
              <button type="button" title="Цены и ограничения" onClick={() => setEditPlan(editPlan === p.id ? '' : p.id)}
                className={`flex h-9 w-9 items-center justify-center rounded-md border text-lg transition ${editPlan === p.id ? 'border-ink bg-ink text-beige' : 'border-ink/20 text-ink hover:border-ink/40'}`}>⚙</button>
            </div>
            {editPlan === p.id ? <PlanCalendar ratePlanId={p.id} roomTypes={roomTypesOf(p.propertyId)} onError={onError} /> : null}
          </Card>
        ))}
      </div>

      {tariffForm && (
        <TariffForm
          plans={plans}
          plan={tariffForm === 'new' ? null : tariffForm}
          onClose={() => setTariffForm(null)}
          onSaved={() => { setTariffForm(null); onChanged(); }}
          onError={onError}
        />
      )}
    </div>
  );
}

const nextDay = (iso: string) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
function dateCols(from: string, to: string): string[] {
  if (!from) return [];
  const end = to || from;
  const res: string[] = [];
  let d = from, guard = 0;
  while (d <= end && guard < 92) { res.push(d); d = nextDay(d); guard++; }
  return res;
}
const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const wdOf = (iso: string) => WD_SHORT[new Date(`${iso}T00:00:00Z`).getUTCDay()] ?? '';

const OCCUPY_ST = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];

/** Матрица цен и ограничений тарифа: категории × даты, ручной ввод + доступность (эталон Bnovo). */
function PlanCalendar({ ratePlanId, roomTypes, onError }: { ratePlanId: string; roomTypes: NamedId[]; onError: (m: string) => void }) {
  const today = todayCal();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(plusN(today, 13));
  const [showPrices, setShowPrices] = useState(true);
  const [showRestr, setShowRestr] = useState(true);
  const [cal, setCal] = useState<Record<string, Record<string, PmsRateCalendarCell>>>({});
  const [avail, setAvail] = useState<Record<string, Record<string, number>>>({});
  const [priceBulk, setPriceBulk] = useState(false);
  const [restrBulk, setRestrBulk] = useState(false);
  const eto = to || from; // эффективный конец периода (to пусто в середине выбора)
  const dates = useMemo(() => dateCols(from, eto), [from, eto]);

  const loadCat = async (rtId: string) => {
    const cells = await adminApi.pmsRateCalendar({ ratePlanId, roomTypeId: rtId, from, to: eto }).catch(() => [] as PmsRateCalendarCell[]);
    const byDate: Record<string, PmsRateCalendarCell> = {};
    for (const c of cells) byDate[c.date.slice(0, 10)] = c;
    setCal((prev) => ({ ...prev, [rtId]: byDate }));
  };
  const loadAll = () => { if (from) roomTypes.forEach((rt) => void loadCat(rt.id)); };
  useEffect(() => { loadAll(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [ratePlanId, from, eto, roomTypes.length]);

  // Доступность по категориям на каждую дату: всего продаваемых номеров − брони − блоки.
  useEffect(() => {
    if (!from) return;
    const cols = dateCols(from, eto);
    void Promise.all([adminApi.pmsRooms({}), adminApi.pmsBookings({ from, to: eto }), adminApi.pmsBlocks({})])
      .then(([rms, bks, blks]: [PmsRoom[], PmsBooking[], PmsRoomBlock[]]) => {
        const totalByRt: Record<string, number> = {};
        const roomsByRt: Record<string, Set<string>> = {};
        for (const r of rms) { if (r.active && r.sellStatus !== 'NOT_SELLABLE') { totalByRt[r.roomType.id] = (totalByRt[r.roomType.id] ?? 0) + 1; (roomsByRt[r.roomType.id] ??= new Set()).add(r.id); } }
        const map: Record<string, Record<string, number>> = {};
        for (const rt of roomTypes) {
          const inner: Record<string, number> = {};
          for (const d of cols) {
            let occ = 0;
            for (const b of bks) if (b.room && b.roomType.id === rt.id && OCCUPY_ST.includes(b.status) && d >= b.checkIn.slice(0, 10) && d < b.checkOut.slice(0, 10)) occ++;
            for (const bl of blks) if (roomsByRt[rt.id]?.has(bl.roomId) && d >= bl.from.slice(0, 10) && d < bl.to.slice(0, 10)) occ++;
            inner[d] = Math.max(0, (totalByRt[rt.id] ?? 0) - occ);
          }
          map[rt.id] = inner;
        }
        setAvail(map);
      }).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, eto, roomTypes.length]);

  const savePrice = (rtId: string, date: string, val: string) => {
    const price = Number(val);
    if (!val.trim() || Number.isNaN(price)) return;
    onError('');
    void adminApi.pmsSetPrices({ ratePlanId, roomTypeId: rtId, from: date, to: nextDay(date), price }).then(() => loadCat(rtId)).catch((e) => onError(e instanceof Error ? e.message : 'Ошибка'));
  };
  const saveRestr = (rtId: string, date: string, patch: { minStay?: number; minStayArrival?: number; maxStay?: number; stopSell?: boolean; closedToArrival?: boolean }) => {
    onError('');
    void adminApi.pmsSetRestrictions({ ratePlanId, roomTypeId: rtId, from: date, to: nextDay(date), ...patch }).then(() => loadCat(rtId)).catch((e) => onError(e instanceof Error ? e.message : 'Ошибка'));
  };
  const numCell = (rtId: string, d: string, key: 'minStay' | 'minStayArrival' | 'maxStay', val: number | null | undefined) => (
    <td key={d} className={`border-l border-ink/10 p-0 ${(val ?? 0) > (key === 'maxStay' ? 0 : 1) ? 'bg-amber-100' : ''}`}>
      <input key={`${rtId}-${d}-${key}-${val ?? ''}`} defaultValue={val ?? ''} onBlur={(e) => { const v = e.target.value.trim(); saveRestr(rtId, d, { [key]: v ? Number(v) : 0 }); }}
        className="h-7 w-full bg-transparent px-1 text-center text-xs text-ink outline-none focus:bg-white" placeholder="—" />
    </td>
  );

  return (
    <div className="border-t border-ink/10 bg-beige/20 px-4 py-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-4">
          <div><span className="mb-1.5 block text-sm text-dark-gray">Период</span><DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} className="w-64" /></div>
          <div className="flex items-center gap-4 pb-2 text-sm text-ink">
            <span className="text-dark-gray">Показать:</span>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} /> Цены</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={showRestr} onChange={(e) => setShowRestr(e.target.checked)} /> Ограничения</label>
          </div>
        </div>
        <div className="flex gap-2 pb-1">
          <Button variant="secondary" onClick={() => setRestrBulk(true)}>Изменить ограничения на период</Button>
          <Button onClick={() => setPriceBulk(true)}>Изменить цены на период</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-md border border-ink/10 bg-white pb-3">
        <table className="border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-[220px] bg-white px-3 py-2 text-left text-xs font-medium text-dark-gray">Категория / показатель</th>
              {dates.map((d) => (
                <th key={d} className={`min-w-[64px] border-l border-ink/10 px-1 py-1.5 text-center text-[11px] font-normal ${wdOf(d) === 'сб' || wdOf(d) === 'вс' ? 'bg-amber-50 text-amber-700' : 'text-dark-gray'}`}>
                  {d.slice(8)}<br /><span className="text-ink/40">{wdOf(d)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roomTypes.length === 0 ? <tr><td colSpan={dates.length + 1} className="px-3 py-3 text-dark-gray">Категорий нет.</td></tr> : null}
            {roomTypes.map((rt) => {
              const row = cal[rt.id] ?? {};
              const av = avail[rt.id] ?? {};
              return (
                <FragmentRows key={rt.id}>
                  <tr className="border-t border-ink/10 bg-ink/[0.03]">
                    <td className="sticky left-0 z-10 bg-ink/[0.03] px-3 py-1.5 font-medium text-ink" colSpan={1}>{rt.name}</td>
                    {dates.map((d) => <td key={d} className="border-l border-ink/10" />)}
                  </tr>
                  {/* Доступность номеров */}
                  <tr className="border-t border-ink/5">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1 pl-6 text-xs text-dark-gray">Доступно</td>
                    {dates.map((d) => { const n = av[d]; return <td key={d} className={`h-6 border-l border-ink/10 text-center text-xs font-medium ${n === 0 ? 'bg-red-200 text-red-700' : 'bg-ink/[0.03] text-ink'}`}>{n ?? ''}</td>; })}
                  </tr>
                  {showRestr ? (
                    <tr className="border-t border-ink/5">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1 pl-6 text-xs text-dark-gray">Продажи</td>
                      {dates.map((d) => {
                        const c = row[d];
                        const closed = c?.stopSell;
                        return <td key={d} className={`h-7 border-l border-ink/10 text-center text-xs ${closed ? 'bg-red-200' : 'bg-emerald-100'}`}>
                          <button type="button" title={closed ? 'Закрыто — открыть' : 'Открыто — закрыть'} onClick={() => saveRestr(rt.id, d, { stopSell: !closed })} className="h-full w-full">{closed ? '✕' : '✓'}</button>
                        </td>;
                      })}
                    </tr>
                  ) : null}
                  {showPrices ? (
                    <tr className="border-t border-ink/5">
                      <td className="sticky left-0 z-10 bg-white px-3 py-1 pl-6 text-xs text-dark-gray">Цена, ₽</td>
                      {dates.map((d) => {
                        const c = row[d];
                        return <td key={d} className="border-l border-ink/10 bg-emerald-50 p-0">
                          <input key={`${rt.id}-${d}-${c?.price ?? ''}`} defaultValue={c?.price ?? ''} onBlur={(e) => savePrice(rt.id, d, e.target.value)}
                            className="h-7 w-full bg-transparent px-1 text-center text-xs text-ink outline-none focus:bg-white" placeholder="—" />
                        </td>;
                      })}
                    </tr>
                  ) : null}
                  {showRestr ? (
                    <>
                      <tr className="border-t border-ink/5">
                        <td className="sticky left-0 z-10 bg-white px-3 py-1 pl-6 text-xs text-dark-gray">Мин. ночей</td>
                        {dates.map((d) => numCell(rt.id, d, 'minStay', row[d]?.minStay))}
                      </tr>
                      <tr className="border-t border-ink/5">
                        <td className="sticky left-0 z-10 bg-white px-3 py-1 pl-6 text-xs text-dark-gray">Мин. ночей на заезд</td>
                        {dates.map((d) => numCell(rt.id, d, 'minStayArrival', row[d]?.minStayArrival))}
                      </tr>
                      <tr className="border-t border-ink/5">
                        <td className="sticky left-0 z-10 bg-white px-3 py-1 pl-6 text-xs text-dark-gray">Макс. ночей</td>
                        {dates.map((d) => numCell(rt.id, d, 'maxStay', row[d]?.maxStay))}
                      </tr>
                    </>
                  ) : null}
                </FragmentRows>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-dark-gray">«Доступно» — свободных номеров на дату. Клик по «Продажи» открывает/закрывает дату; цену и ограничения вводите прямо в ячейке (сохранение по выходу из поля).</p>

      {priceBulk && <PriceBulkPopup ratePlanId={ratePlanId} roomTypes={roomTypes} defaultFrom={from} defaultTo={eto} onClose={() => setPriceBulk(false)} onSaved={() => { setPriceBulk(false); loadAll(); }} onError={onError} />}
      {restrBulk && <BulkRestrictionPopup plans={[{ id: ratePlanId, name: 'Этот тариф' }]} roomTypes={roomTypes} defaultFrom={from} defaultTo={eto} preselectPlan={ratePlanId} preselectType="" onClose={() => setRestrBulk(false)} onSaved={() => { setRestrBulk(false); loadAll(); }} />}
    </div>
  );
}

const todayCal = () => new Date().toISOString().slice(0, 10);
const plusN = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

/** Массовое изменение цен на период по выбранным категориям. */
const PRICE_MODES: { value: 'set' | 'inc_pct' | 'dec_pct' | 'inc_abs' | 'dec_abs'; label: string; unit: string }[] = [
  { value: 'set', label: 'Новое значение', unit: '₽' },
  { value: 'inc_pct', label: 'Увеличить на', unit: '%' },
  { value: 'dec_pct', label: 'Уменьшить на', unit: '%' },
  { value: 'inc_abs', label: 'Увеличить на', unit: '₽' },
  { value: 'dec_abs', label: 'Уменьшить на', unit: '₽' },
];

/** Изменение цен на период (эталон Bnovo): периоды, категории, дни недели, режим изменения. */
function PriceBulkPopup({ ratePlanId, roomTypes, defaultFrom, defaultTo, onClose, onSaved, onError }: {
  ratePlanId: string; roomTypes: NamedId[]; defaultFrom: string; defaultTo: string; onClose: () => void; onSaved: () => void; onError: (m: string) => void;
}) {
  const [periods, setPeriods] = useState<{ from: string; to: string }[]>([{ from: defaultFrom, to: defaultTo }]);
  const [typeIds, setTypeIds] = useState<string[]>(roomTypes.map((t) => t.id));
  const [days, setDays] = useState<number[]>(WEEKDAYS.map(([, n]) => n));
  const [mode, setMode] = useState<typeof PRICE_MODES[number]['value']>('set');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const unit = PRICE_MODES.find((m) => m.value === mode)!.unit;

  const toggleType = (id: string) => setTypeIds((a) => a.includes(id) ? a.filter((x) => x !== id) : [...a, id]);
  const toggleDay = (n: number) => setDays((a) => a.includes(n) ? a.filter((x) => x !== n) : [...a, n]);
  const setPeriod = (i: number, f: string, t: string) => setPeriods((p) => p.map((x, idx) => idx === i ? { from: f, to: t } : x));

  async function save() {
    setErr('');
    if (typeIds.length === 0) return setErr('Выберите категории');
    if (days.length === 0) return setErr('Выберите дни недели');
    if (periods.some((p) => !p.from || !p.to)) return setErr('Заполните периоды');
    if (!value.trim() || Number.isNaN(Number(value))) return setErr('Укажите значение');
    setSaving(true);
    try {
      const res = await adminApi.pmsBulkPrices({
        ratePlanId,
        roomTypeIds: typeIds,
        periods: periods.map((p) => ({ from: p.from, to: nextDay(p.to) })),
        weekdays: days.length === 7 ? undefined : days,
        mode,
        value: Number(value),
      });
      if (res.updated === 0) setErr('Не изменено ни одной ночи (для ±% и ±₽ нужна текущая цена).');
      else onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); onError(''); }
    finally { setSaving(false); }
  }

  return (
    <ModalShell onClose={onClose} wide>
      <p className="mb-4 text-lg font-medium text-ink">Изменение цен на период</p>

      {/* Периоды */}
      <div className="mb-3">
        <p className="mb-1.5 text-sm font-medium text-ink">Период</p>
        <div className="space-y-2">
          {periods.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <DateRangePicker from={p.from} to={p.to} onChange={(f, t) => setPeriod(i, f, t)} />
              {periods.length > 1 ? <button type="button" onClick={() => setPeriods((ps) => ps.filter((_, idx) => idx !== i))} className="text-sm text-red-600">✕</button> : null}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setPeriods((p) => [...p, { from: defaultFrom, to: defaultTo }])} className="mt-2 flex items-center gap-1 text-sm text-primary hover:underline">⊕ Добавить период</button>
      </div>

      {/* Категории */}
      <MultiSelectField label="Категории" required placeholder="выбрать…" summary={typeIds.length === roomTypes.length ? 'Выбраны все категории' : `Выбрано: ${typeIds.length}`}>
        {roomTypes.map((t) => <label key={t.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-ink hover:bg-ink/5"><input type="checkbox" checked={typeIds.includes(t.id)} onChange={() => toggleType(t.id)} /> {t.name}</label>)}
      </MultiSelectField>

      {/* Дни недели */}
      <MultiSelectField label="Дни недели" summary={days.length === 7 ? 'Выбраны все пункты' : WEEKDAYS.filter(([, n]) => days.includes(n)).map(([l]) => l).join(', ')}>
        {WEEKDAYS.map(([label, n]) => <label key={n} className="flex items-center gap-2 px-3 py-1.5 text-sm text-ink hover:bg-ink/5"><input type="checkbox" checked={days.includes(n)} onChange={() => toggleDay(n)} /> {label}</label>)}
      </MultiSelectField>

      {/* Изменение цены */}
      <div className="mb-4">
        <p className="mb-1.5 text-sm font-medium text-ink">Изменение цены</p>
        <div className="flex items-center gap-2">
          <select value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} className="rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
            {PRICE_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}{m.value === 'set' ? '' : ` (${m.unit})`}</option>)}
          </select>
          <div className="flex items-center">
            <input value={value} onChange={(e) => setValue(e.target.value)} type="number" min={0} placeholder="значение" className="w-32 rounded-md border border-ink/20 px-3 py-2 text-sm" />
            <span className="ml-1 text-sm text-dark-gray">{unit}</span>
          </div>
        </div>
        {mode !== 'set' ? <p className="mt-1 text-xs text-dark-gray">Применяется к текущей цене ночи; ночи без установленной цены пропускаются.</p> : null}
      </div>

      {err ? <p className="mb-2 text-sm text-red-600">{err}</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Отменить</Button>
        <Button onClick={() => void save()} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить цены'}</Button>
      </div>
    </ModalShell>
  );
}

/** Поле-мультиселект с выпадающим списком чекбоксов (эталон Bnovo). */
function MultiSelectField({ label, summary, placeholder, required, children }: { label: string; summary: string; placeholder?: string; required?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-3">
      <p className="mb-1.5 text-sm font-medium text-ink">{label}</p>
      <div className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)} className={`flex w-full items-center justify-between rounded-md border bg-white px-3 py-2 text-left text-sm ${required && summary.startsWith('Выбрано: 0') ? 'border-red-400' : 'border-ink/20'}`}>
          <span className={summary ? 'text-ink' : 'text-dark-gray'}>{summary || placeholder}</span>
          <span className="text-ink/40">▾</span>
        </button>
        {open ? (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-ink/15 bg-white py-1 shadow-lg">{children}</div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// ─────────── Вкладка «Массовое ограничение продаж» (шахматка + поп-ап) ───────────
const CELL: Record<string, string> = { open: 'bg-emerald-400', closed: 'bg-red-400', restricted: 'bg-amber-300' };
const WEEKDAYS: [string, number][] = [['Пн', 1], ['Вт', 2], ['Ср', 3], ['Чт', 4], ['Пт', 5], ['Сб', 6], ['Вс', 0]];
const isoAdd = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
type TriState = '' | 'open' | 'close';

function RestrictionsTab({ options, plans }: { options: PmsRoomOption[]; plans: PmsRatePlan[] }) {
  // Сеть целиком — без выбора объекта. Тарифы и категории — с подразделами по объекту.
  const propName = (id: string | null) => (id ? options.find((o) => o.id === id)?.name ?? 'Объект' : 'Вся сеть');
  const planGroups = useMemo(() => {
    const m = new Map<string, PmsRatePlan[]>();
    for (const p of plans) { const g = propName(p.propertyId); const a = m.get(g) ?? []; a.push(p); m.set(g, a); }
    return [...m.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, options]);
  const allPlans = useMemo<NamedId[]>(() => plans.map((p) => ({ id: p.id, name: `${propName(p.propertyId)} · ${p.name}` })), [plans]); // eslint-disable-line react-hooks/exhaustive-deps
  const allRoomTypes = useMemo<NamedId[]>(() => options.flatMap((o) => o.roomTypes.map((rt) => ({ id: rt.id, name: `${o.name} · ${rt.name}` }))), [options]);

  const [mode, setMode] = useState<'plans' | 'roomTypes'>('plans');
  const [selectedId, setSelectedId] = useState('');
  const [from, setFrom] = useState(isoAdd(0));
  const [to, setTo] = useState(isoAdd(30));
  const [grid, setGrid] = useState<RestrictionGrid | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const eto = to || from;

  useEffect(() => { setSelectedId(mode === 'plans' ? (plans[0]?.id ?? '') : (options[0]?.roomTypes[0]?.id ?? '')); }, [mode, plans, options]);

  const loadGrid = () => {
    if (!selectedId || !from) { setGrid(null); return; }
    const params = mode === 'plans' ? { from, to: eto, ratePlanId: selectedId } : { from, to: eto, roomTypeId: selectedId };
    void adminApi.pmsRestrictionGrid(params).then(setGrid).catch(() => setGrid(null));
  };
  useEffect(() => { loadGrid(); }, [selectedId, from, eto, mode]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <span className="mb-1.5 block text-sm text-dark-gray">Показать по</span>
          <div className="flex gap-1 rounded-lg bg-ink/5 p-1">
            {([['plans', 'Тарифам'], ['roomTypes', 'Категориям']] as ['plans' | 'roomTypes', string][]).map(([m, l]) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-md px-3 py-1 text-sm transition ${mode === m ? 'bg-white font-medium text-ink shadow-sm' : 'text-dark-gray hover:text-ink'}`}>{l}</button>
            ))}
          </div>
        </div>
        <label className="block"><span className="mb-1.5 block text-sm text-dark-gray">{mode === 'plans' ? 'Тариф' : 'Категория'}</span>
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} className={`${selectCls} w-auto`}>
            {mode === 'plans'
              ? planGroups.map(([g, ps]) => <optgroup key={g} label={g}>{ps.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>)
              : options.map((o) => <optgroup key={o.id} label={o.name}>{o.roomTypes.map((rt) => <option key={rt.id} value={rt.id}>{rt.name}</option>)}</optgroup>)}
          </select>
        </label>
        <div><span className="mb-1.5 block text-sm text-dark-gray">Период просмотра</span><DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} className="w-64" /></div>
        <Button onClick={() => setShowPopup(true)}>Изменить ограничение на период</Button>
      </div>

      <div className="mb-3 flex items-center gap-4 text-xs text-dark-gray">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-emerald-400" /> открыто</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-red-400" /> закрыто</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm bg-amber-300" /> есть ограничения</span>
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full border-collapse text-sm">
          <thead><tr>
            <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-xs font-medium text-dark-gray">{mode === 'plans' ? 'Категория' : 'Тариф'}</th>
            {(grid?.dates ?? []).map((d) => <th key={d} className="min-w-[34px] border-l border-ink/10 px-1 py-2 text-center text-[11px] font-normal text-dark-gray">{d.slice(8)}<br /><span className="text-ink/40">{d.slice(5, 7)}</span></th>)}
          </tr></thead>
          <tbody>
            {!grid || grid.rows.length === 0 ? <tr><td colSpan={(grid?.dates.length ?? 0) + 1} className="px-3 py-4 text-dark-gray">Нет данных. Выберите {mode === 'plans' ? 'тариф' : 'категорию'} и период.</td></tr> : null}
            {grid?.rows.map((row) => (
              <tr key={row.id} className="border-t border-ink/10">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1.5 text-ink">{row.name}</td>
                {row.cells.map((c, i) => <td key={i} title={c === 'open' ? 'открыто' : c === 'closed' ? 'закрыто' : 'ограничения'} className={`h-7 border-l border-ink/10 ${CELL[c] ?? ''}`} />)}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {showPopup && (
        <BulkRestrictionPopup
          plans={allPlans} roomTypes={allRoomTypes} defaultFrom={from} defaultTo={eto}
          preselectPlan={mode === 'plans' ? selectedId : ''} preselectType={mode === 'roomTypes' ? selectedId : ''}
          onClose={() => setShowPopup(false)}
          onSaved={() => { setShowPopup(false); loadGrid(); }}
        />
      )}
    </div>
  );
}

function BulkRestrictionPopup(props: {
  plans: NamedId[]; roomTypes: NamedId[]; defaultFrom: string; defaultTo: string;
  preselectPlan: string; preselectType: string; onClose: () => void; onSaved: () => void;
}) {
  const { plans, roomTypes, defaultFrom, defaultTo, preselectPlan, preselectType, onClose, onSaved } = props;
  const [planIds, setPlanIds] = useState<string[]>(preselectPlan ? [preselectPlan] : plans.map((p) => p.id));
  const [typeIds, setTypeIds] = useState<string[]>(preselectType ? [preselectType] : roomTypes.map((t) => t.id));
  const [periods, setPeriods] = useState<{ from: string; to: string }[]>([{ from: defaultFrom, to: defaultTo }]);
  const [days, setDays] = useState<number[]>([]);
  const [sales, setSales] = useState<TriState>('');
  const [arrival, setArrival] = useState<TriState>('');
  const [departure, setDeparture] = useState<TriState>('');
  const [minStay, setMinStay] = useState('');
  const [minStayArrival, setMinStayArrival] = useState('');
  const [maxStay, setMaxStay] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const toggle = (arr: string[], id: string, set: (v: string[]) => void) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

  function reset() {
    setSales(''); setArrival(''); setDeparture(''); setMinStay(''); setMinStayArrival(''); setMaxStay(''); setDays([]);
    setPeriods([{ from: defaultFrom, to: defaultTo }]);
    setPlanIds(plans.map((p) => p.id)); setTypeIds(roomTypes.map((t) => t.id));
  }
  async function save() {
    setErr('');
    if (typeIds.length === 0) { setErr('Не заданы категории для обновления'); return; }
    if (planIds.length === 0) { setErr('Не заданы тарифы для обновления'); return; }
    const validPeriods = periods.filter((p) => p.from && p.to);
    if (validPeriods.length === 0) { setErr('Добавьте хотя бы один период (с датой начала и конца)'); return; }
    const hasR = sales || arrival || departure || minStay || minStayArrival || maxStay;
    if (!hasR) { setErr('Не заданы ограничения для обновления'); return; }
    setSaving(true);
    try {
      for (const p of validPeriods) {
        await adminApi.pmsBulkRestrictions({
          ratePlanIds: planIds, roomTypeIds: typeIds, from: p.from, to: p.to, weekdays: days.length ? days : undefined,
          sales: sales || undefined, arrival: arrival || undefined, departure: departure || undefined,
          minStay: num(minStay), maxStay: num(maxStay), minStayArrival: num(minStayArrival),
        });
      }
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); setSaving(false); }
  }

  const TriBtns = ({ label, val, set }: { label: string; val: TriState; set: (v: TriState) => void }) => (
    <div className="flex items-center gap-3">
      <span className="w-16 text-sm text-ink">{label}</span>
      <div className="flex gap-1 rounded-lg bg-ink/5 p-1">
        {([['', 'Не менять'], ['close', 'Закрыть'], ['open', 'Открыть']] as [TriState, string][]).map(([v, l]) => (
          <button key={v} type="button" onClick={() => set(v)} className={`rounded-md px-3 py-1 text-sm transition ${val === v ? 'bg-white font-medium text-ink shadow-sm' : 'text-dark-gray hover:text-ink'}`}>{l}</button>
        ))}
      </div>
    </div>
  );

  return (
    <ModalShell onClose={onClose}>
      <p className="mb-4 text-lg font-medium text-ink">Массовое обновление ограничений</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-sm text-dark-gray">Категории</p>
          <div className="max-h-32 overflow-y-auto rounded-md border border-ink/10 p-2">
            {roomTypes.map((t) => <label key={t.id} className="flex items-center gap-2 py-0.5 text-sm text-ink"><input type="checkbox" checked={typeIds.includes(t.id)} onChange={() => toggle(typeIds, t.id, setTypeIds)} /> {t.name}</label>)}
          </div>
          {typeIds.length === 0 ? <p className="mt-1 text-xs text-red-600">Не заданы категории для обновления.</p> : null}
        </div>
        <div>
          <p className="mb-1.5 text-sm text-dark-gray">Тарифы</p>
          <div className="max-h-32 overflow-y-auto rounded-md border border-ink/10 p-2">
            {plans.map((p) => <label key={p.id} className="flex items-center gap-2 py-0.5 text-sm text-ink"><input type="checkbox" checked={planIds.includes(p.id)} onChange={() => toggle(planIds, p.id, setPlanIds)} /> {p.name}</label>)}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-sm text-dark-gray">Периоды ограничений</p>
        <div className="space-y-2">
          {periods.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <DateRangePicker from={p.from} to={p.to} className="flex-1" onChange={(f, t) => setPeriods((prev) => prev.map((x, idx) => (idx === i ? { from: f, to: t } : x)))} />
              {periods.length > 1 ? <button type="button" onClick={() => setPeriods((prev) => prev.filter((_, idx) => idx !== i))} className="rounded-md border border-ink/20 px-2.5 py-2 text-sm text-red-600 hover:bg-red-50">×</button> : null}
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setPeriods((prev) => [...prev, { from: '', to: '' }])} className="mt-2 text-sm text-primary underline underline-offset-2 hover:no-underline">+ Добавить период</button>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-sm text-dark-gray">Дни недели <span className="text-xs">(пусто = все)</span></p>
        <div className="flex gap-1">
          {WEEKDAYS.map(([label, n]) => (
            <button key={n} type="button" onClick={() => setDays((d) => d.includes(n) ? d.filter((x) => x !== n) : [...d, n])}
              className={`h-8 w-10 rounded-md border text-sm transition ${days.includes(n) ? 'border-ink bg-ink text-beige' : 'border-ink/20 text-dark-gray hover:border-ink/40'}`}>{label}</button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-ink/10 pt-4">
        <TriBtns label="Продажи" val={sales} set={setSales} />
        <TriBtns label="Заезд" val={arrival} set={setArrival} />
        <TriBtns label="Выезд" val={departure} set={setDeparture} />
      </div>
      <div className="mt-4 grid gap-3 border-t border-ink/10 pt-4 sm:grid-cols-3">
        <Input id="bmin" label="Мин. кол-во ночей" value={minStay} onChange={(e) => setMinStay(e.target.value)} />
        <Input id="bmina" label="Мин. ночей на дату заезда" value={minStayArrival} onChange={(e) => setMinStayArrival(e.target.value)} />
        <Input id="bmax" label="Макс. кол-во ночей" value={maxStay} onChange={(e) => setMaxStay(e.target.value)} />
      </div>

      {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
      <div className="mt-5 flex justify-between">
        <Button variant="secondary" onClick={reset}>× Сбросить фильтры</Button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button onClick={() => void save()} disabled={saving}>{saving ? 'Сохранение…' : 'Сохранить ограничения'}</Button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─────────── Вкладка «Промокоды» ───────────
const APPS: [string, string][] = [['DISCOUNT', 'Скидка'], ['ROOM_UPGRADE', 'Повышение категории номера'], ['FREE_SERVICE', 'Бесплатная услуга']];
const SOURCES = ['Модуль бронирования', 'Стойка', 'OTA', 'Любой источник'];
const appLabel = (a: string) => APPS.find(([v]) => v === a)?.[1] ?? a;
type PForm = {
  id: string; code: string; comment: string; application: string; type: string; value: string; maxUses: string;
  validFrom: string; validUntil: string; roomTypeIds: string[]; ratePlanIds: string[];
  showOnlyMatchingCategories: boolean; showOnlyMatchingTariffs: boolean; source: string;
  bookingMethod: string; referralSource: string; discountReason: string; autoApplyOnEmail: boolean; ignoreRestrictions: boolean;
  upgradeFromRoomTypeId: string; upgradeToRoomTypeId: string; freeExtraId: string;
};
const emptyPromo: PForm = {
  id: '', code: '', comment: '', application: 'DISCOUNT', type: 'PERCENT', value: '10', maxUses: '',
  validFrom: '', validUntil: '', roomTypeIds: [], ratePlanIds: [], showOnlyMatchingCategories: false, showOnlyMatchingTariffs: false,
  source: 'Модуль бронирования', bookingMethod: '', referralSource: '', discountReason: '', autoApplyOnEmail: false, ignoreRestrictions: false,
  upgradeFromRoomTypeId: '', upgradeToRoomTypeId: '', freeExtraId: '',
};

function PromocodesTab({ options, plans, onError }: { options: PmsRoomOption[]; plans: PmsRatePlan[]; onError: (m: string) => void }) {
  const [list, setList] = useState<Promocode[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [marketing, setMarketing] = useState<MarketingOption[]>([]);
  const [form, setForm] = useState<PForm | null>(null);
  const mkOpts = (k: MarketingKind) => marketing.filter((o) => o.kind === k && o.active).map((o) => o.label);

  // Сеть целиком: категории и тарифы всех объектов с префиксом названия объекта.
  const allRoomTypes = useMemo<NamedId[]>(() => options.flatMap((o) => o.roomTypes.map((rt) => ({ id: rt.id, name: `${o.name} · ${rt.name}` }))), [options]);
  const allPlans = useMemo<NamedId[]>(() => {
    const pn = (id: string | null) => (id ? options.find((o) => o.id === id)?.name ?? '' : 'Вся сеть');
    return plans.map((p) => ({ id: p.id, name: `${pn(p.propertyId)} · ${p.name}` }));
  }, [plans, options]);

  const load = () => adminApi.pmsPromocodes().then(setList).catch(() => undefined);
  useEffect(() => {
    void load();
    void adminApi.extras().then(setExtras).catch(() => setExtras([]));
    void adminApi.marketingOptions().then(setMarketing).catch(() => setMarketing([]));
  }, []);

  const openEdit = (p: Promocode) => setForm({
    id: p.id, code: p.code, comment: p.comment ?? '', application: p.application, type: p.type, value: String(p.value),
    maxUses: p.maxUses == null ? '' : String(p.maxUses), validFrom: p.validFrom?.slice(0, 10) ?? '', validUntil: p.validUntil?.slice(0, 10) ?? '',
    roomTypeIds: p.roomTypeIds, ratePlanIds: p.ratePlanIds, showOnlyMatchingCategories: p.showOnlyMatchingCategories, showOnlyMatchingTariffs: p.showOnlyMatchingTariffs,
    source: p.source ?? 'Модуль бронирования', bookingMethod: p.bookingMethod ?? '', referralSource: p.referralSource ?? '', discountReason: p.discountReason ?? '',
    autoApplyOnEmail: p.autoApplyOnEmail, ignoreRestrictions: p.ignoreRestrictions,
    upgradeFromRoomTypeId: p.upgradeFromRoomTypeId ?? '', upgradeToRoomTypeId: p.upgradeToRoomTypeId ?? '', freeExtraId: p.freeExtraId ?? '',
  });
  const del = (p: Promocode) => { if (confirm(`Удалить промокод «${p.code}»?`)) void adminApi.pmsDeletePromocode(p.id).then(load).catch((e) => onError(e instanceof Error ? e.message : 'Ошибка')); };

  return (
    <div>
      <div className="mb-4"><Button onClick={() => setForm({ ...emptyPromo })}>+ Добавить промокод</Button></div>
      {list.length === 0 ? <p className="text-sm text-dark-gray">Промокодов нет.</p> : null}
      <div className="overflow-hidden rounded-lg border border-ink/10">
        {list.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 border-b border-ink/5 bg-white px-4 py-2.5 text-sm last:border-b-0">
            <span className="w-28 shrink-0 font-mono text-ink">{p.code}</span>
            <span className="w-52 shrink-0 text-dark-gray">{p.application === 'DISCOUNT' ? (p.type === 'PERCENT' ? `скидка −${p.value}%` : `скидка −${p.value} ₽`) : appLabel(p.application)}</span>
            <span className="text-xs text-dark-gray">брони: {p.usedCount}{p.maxUses ? ` из ${p.maxUses}` : ' (без лимита)'}</span>
            <span className="text-xs text-dark-gray">{p.validFrom || p.validUntil ? `${p.validFrom ? new Date(p.validFrom).toLocaleDateString('ru-RU') : '…'} – ${p.validUntil ? new Date(p.validUntil).toLocaleDateString('ru-RU') : '…'}` : 'всегда'}</span>
            <span className="ml-auto flex items-center gap-2">
              <Toggle on={p.active} onClick={() => { void adminApi.pmsTogglePromocode(p.id, !p.active).then(load).catch((e) => onError(e instanceof Error ? e.message : 'Ошибка')); }} title="Активен" />
              <button type="button" onClick={() => openEdit(p)} className="rounded px-2 py-1 text-xs text-ink hover:bg-ink/5" title="Редактировать">✎</button>
              <button type="button" onClick={() => del(p)} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50" title="Удалить">🗑</button>
            </span>
          </div>
        ))}
      </div>

      {form && <PromocodeForm form={form} setForm={setForm} plans={allPlans} roomTypes={allRoomTypes} extras={extras}
        methods={mkOpts('BOOKING_METHOD')} referrals={mkOpts('REFERRAL_SOURCE')} discountReasons={mkOpts('DISCOUNT_REASON')}
        onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
    </div>
  );
}

/** Выпадающий список из словаря маркетинга; если текущее значение не в списке — показываем его отдельно. */
function DictSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <label className="block"><span className="mb-1.5 block text-sm text-dark-gray">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectCls}>
        <option value="">— не выбрано —</option>
        {all.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function PromocodeForm(props: {
  form: PForm; setForm: (f: PForm) => void; plans: NamedId[]; roomTypes: NamedId[]; extras: Extra[];
  methods: string[]; referrals: string[]; discountReasons: string[];
  onClose: () => void; onSaved: () => void;
}) {
  const { form, setForm, plans, roomTypes, extras, methods, referrals, discountReasons, onClose, onSaved } = props;
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (patch: Partial<PForm>) => setForm({ ...form, ...patch });
  const toggleId = (arr: string[], id: string, key: 'roomTypeIds' | 'ratePlanIds') => set({ [key]: arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id] } as Partial<PForm>);

  function save() {
    setErr('');
    if (!form.code.trim()) { setErr('Укажите код'); return; }
    if (form.roomTypeIds.length === 0) { setErr('Выберите категории (Номера)'); return; }
    if (form.ratePlanIds.length === 0) { setErr('Выберите тарифы'); return; }
    if (form.application === 'ROOM_UPGRADE' && (!form.upgradeFromRoomTypeId || !form.upgradeToRoomTypeId)) { setErr('Укажите категории «с» и «на» для повышения'); return; }
    if (form.application === 'FREE_SERVICE' && !form.freeExtraId) { setErr('Выберите бесплатную услугу'); return; }
    setSaving(true);
    const body = {
      code: form.code.trim(), comment: form.comment || undefined, application: form.application,
      type: form.type, value: form.application === 'DISCOUNT' ? Number(form.value || 0) : 0,
      maxUses: form.maxUses.trim() === '' ? undefined : Number(form.maxUses),
      validFrom: form.validFrom || undefined, validUntil: form.validUntil || undefined,
      roomTypeIds: form.roomTypeIds, ratePlanIds: form.ratePlanIds,
      showOnlyMatchingCategories: form.showOnlyMatchingCategories, showOnlyMatchingTariffs: form.showOnlyMatchingTariffs,
      source: form.source || undefined, bookingMethod: form.bookingMethod || undefined,
      referralSource: form.referralSource || undefined, discountReason: form.discountReason || undefined,
      autoApplyOnEmail: form.autoApplyOnEmail, ignoreRestrictions: form.ignoreRestrictions,
      upgradeFromRoomTypeId: form.application === 'ROOM_UPGRADE' ? form.upgradeFromRoomTypeId : undefined,
      upgradeToRoomTypeId: form.application === 'ROOM_UPGRADE' ? form.upgradeToRoomTypeId : undefined,
      freeExtraId: form.application === 'FREE_SERVICE' ? form.freeExtraId : undefined,
    };
    const p = form.id ? adminApi.pmsUpdatePromocode(form.id, body) : adminApi.pmsCreatePromocode(body);
    p.then(onSaved).catch((e) => { setErr(e instanceof Error ? e.message : 'Ошибка'); setSaving(false); });
  }

  return (
    <ModalShell onClose={onClose}>
      <p className="mb-4 text-lg font-medium text-ink">{form.id ? 'Редактировать промокод' : 'Новый промокод'}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input id="code" label="Код" value={form.code} onChange={(e) => set({ code: e.target.value })} />
        <Input id="maxUses" label="Количество бронирований (пусто — без лимита)" value={form.maxUses} onChange={(e) => set({ maxUses: e.target.value })} />
        <Input id="comment" label="Комментарий (гость не видит)" className="sm:col-span-2" value={form.comment} onChange={(e) => set({ comment: e.target.value })} />

        <label className="block"><span className="mb-1.5 block text-sm text-dark-gray">Применение</span>
          <select value={form.application} onChange={(e) => set({ application: e.target.value })} className={selectCls}>{APPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </label>
        {form.application === 'DISCOUNT' ? (
          <div className="flex items-end gap-2">
            <div className="flex-1"><Input id="val" label="Размер скидки" value={form.value} onChange={(e) => set({ value: e.target.value })} /></div>
            <select value={form.type} onChange={(e) => set({ type: e.target.value })} className={`${selectCls} w-20`}><option value="PERCENT">%</option><option value="FIXED">₽</option></select>
          </div>
        ) : <div />}
      </div>

      {form.application === 'ROOM_UPGRADE' ? (
        <div className="mt-3 grid gap-3 rounded-md border border-ink/10 bg-beige/20 p-3 sm:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-sm text-dark-gray">Повышение с категории</span>
            <select value={form.upgradeFromRoomTypeId} onChange={(e) => set({ upgradeFromRoomTypeId: e.target.value })} className={selectCls}>
              <option value="">— выберите —</option>{roomTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="mb-1.5 block text-sm text-dark-gray">На категорию</span>
            <select value={form.upgradeToRoomTypeId} onChange={(e) => set({ upgradeToRoomTypeId: e.target.value })} className={selectCls}>
              <option value="">— выберите —</option>{roomTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
        </div>
      ) : null}
      {form.application === 'FREE_SERVICE' ? (
        <div className="mt-3 rounded-md border border-ink/10 bg-beige/20 p-3">
          <label className="block"><span className="mb-1.5 block text-sm text-dark-gray">Бесплатная услуга</span>
            <select value={form.freeExtraId} onChange={(e) => set({ freeExtraId: e.target.value })} className={selectCls}>
              <option value="">— выберите услугу —</option>
              {extras.map((ex) => <option key={ex.id} value={ex.id}>{ex.name} · {ex.price.toLocaleString('ru-RU')} ₽</option>)}
            </select>
            {extras.length === 0 ? <p className="mt-1 text-xs text-amber-700">Список услуг пуст — добавьте их в разделе «Настройки гостиниц → Доп. услуги».</p> : null}
          </label>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-sm text-dark-gray">Номера (категории)</p>
          <div className="max-h-28 overflow-y-auto rounded-md border border-ink/10 p-2">
            {roomTypes.map((t) => <label key={t.id} className="flex items-center gap-2 py-0.5 text-sm text-ink"><input type="checkbox" checked={form.roomTypeIds.includes(t.id)} onChange={() => toggleId(form.roomTypeIds, t.id, 'roomTypeIds')} /> {t.name}</label>)}
          </div>
          <label className="mt-1 flex items-center gap-2 text-xs text-dark-gray"><input type="checkbox" checked={form.showOnlyMatchingCategories} onChange={(e) => set({ showOnlyMatchingCategories: e.target.checked })} /> показывать только эти категории</label>
        </div>
        <div>
          <p className="mb-1.5 text-sm text-dark-gray">Тарифы</p>
          <div className="max-h-28 overflow-y-auto rounded-md border border-ink/10 p-2">
            {plans.map((p) => <label key={p.id} className="flex items-center gap-2 py-0.5 text-sm text-ink"><input type="checkbox" checked={form.ratePlanIds.includes(p.id)} onChange={() => toggleId(form.ratePlanIds, p.id, 'ratePlanIds')} /> {p.name}</label>)}
          </div>
          <label className="mt-1 flex items-center gap-2 text-xs text-dark-gray"><input type="checkbox" checked={form.showOnlyMatchingTariffs} onChange={(e) => set({ showOnlyMatchingTariffs: e.target.checked })} /> показывать только эти тарифы</label>
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="mb-1.5 block text-sm text-dark-gray">Источник</span>
          <select value={form.source} onChange={(e) => set({ source: e.target.value })} className={selectCls}>{SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        </label>
        <div />
        <div className="sm:col-span-2"><span className="mb-1.5 block text-sm text-dark-gray">Период действия (пусто — всегда)</span>
          <DateRangePicker from={form.validFrom} to={form.validUntil} className="max-w-sm" onChange={(f, t) => set({ validFrom: f, validUntil: t })} />
        </div>
        <DictSelect label="Способ бронирования" value={form.bookingMethod} options={methods} onChange={(v) => set({ bookingMethod: v })} />
        <DictSelect label="Откуда узнали" value={form.referralSource} options={referrals} onChange={(v) => set({ referralSource: v })} />
        <div className="sm:col-span-2"><DictSelect label="Обоснование скидки" value={form.discountReason} options={discountReasons} onChange={(v) => set({ discountReason: v })} /></div>
      </div>

      <div className="mt-3 space-y-1.5">
        <label className="flex items-center gap-2 text-sm text-dark-gray"><input type="checkbox" checked={form.autoApplyOnEmail} onChange={(e) => set({ autoApplyOnEmail: e.target.checked })} /> Автоматически применять промокод при вводе гостем эл. почты</label>
        <label className="flex items-center gap-2 text-sm text-dark-gray"><input type="checkbox" checked={form.ignoreRestrictions} onChange={(e) => set({ ignoreRestrictions: e.target.checked })} /> Игнорировать ограничения (min/max ночей)</label>
      </div>

      {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Отмена</Button>
        <Button onClick={save} disabled={saving}>{saving ? 'Сохранение…' : (form.id ? 'Сохранить' : 'Создать')}</Button>
      </div>
    </ModalShell>
  );
}
