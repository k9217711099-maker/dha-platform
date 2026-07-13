'use client';

import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, type BookingPayment, type BookingPaymentInfo, type Counterparty, type Deposit, type FinanceDoc, type FinanceDocLine, type LegalEntity, type PaymentSystem, type PmsBooking } from '../../../lib/api';
import { money } from './booking-view';
import { useEsc } from '../../../lib/use-esc';
import { DatePicker } from '../../../components/DatePicker';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU');
const todayIso = () => new Date().toISOString().slice(0, 10);

const PAY_METHOD_LABEL: Record<string, string> = { cash: 'Наличные', card: 'Банковский терминал', transfer: 'Безнал', other: 'Другое' };
const SETTLEMENT_LABEL: Record<string, string> = { prepay100: 'Предоплата 100%', prepay: 'Предоплата', advance: 'Аванс', full: 'Полный расчёт', credit: 'Кредит' };
const PAY_STATUS: Record<string, { label: string; cls: string }> = {
  PAID: { label: 'Оплачен', cls: 'bg-emerald-100 text-emerald-700' },
  PENDING: { label: 'Ожидает', cls: 'bg-amber-100 text-amber-700' },
  AUTHORIZED: { label: 'Холд', cls: 'bg-sky-100 text-sky-700' },
  REFUNDED: { label: 'Возврат', cls: 'bg-rose-100 text-rose-700' },
  PARTIALLY_REFUNDED: { label: 'Частичный возврат', cls: 'bg-rose-100 text-rose-700' },
  FAILED: { label: 'Ошибка', cls: 'bg-ink/10 text-dark-gray' },
  NOT_PAID: { label: 'Не оплачен', cls: 'bg-ink/10 text-dark-gray' },
};
const DEP_STATUS: Record<string, { label: string; cls: string }> = {
  HELD: { label: 'Удержан', cls: 'bg-amber-100 text-amber-700' },
  CAPTURED: { label: 'Списан', cls: 'bg-rose-100 text-rose-700' },
  RELEASED: { label: 'Снят', cls: 'bg-emerald-100 text-emerald-700' },
  REFUNDED: { label: 'Возвращён', cls: 'bg-emerald-100 text-emerald-700' },
};
const DOC_TYPE_LABEL: Record<string, string> = { INVOICE: 'Счёт', RECEIPT: 'Квитанция', ONLINE: 'Онлайн-оплата', ACT: 'Акт' };

const fieldCls = 'w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';

// Актуальные ставки НДС РФ (2026): «Без НДС», 0%, 5% и 7% (для УСН, реформа 2025), 10%
// (льготная), 22% (базовая с 2026). Числовая ставка (rate) применяется к позициям/платежу.
const VAT_OPTIONS = [
  { code: 'none', label: 'Без НДС', rate: 0 },
  { code: '0', label: 'НДС 0%', rate: 0 },
  { code: '5', label: 'НДС 5%', rate: 5 },
  { code: '7', label: 'НДС 7%', rate: 7 },
  { code: '10', label: 'НДС 10%', rate: 10 },
  { code: '22', label: 'НДС 22%', rate: 22 },
] as const;
const vatCodeFromRate = (n: number | null | undefined): string => (n == null ? 'none' : VAT_OPTIONS.some((o) => o.code === String(n)) ? String(n) : 'none');
const vatRateOf = (code: string): number => VAT_OPTIONS.find((o) => o.code === code)?.rate ?? 0;
/** Ставка НДС для передачи в API: undefined для «Без НДС», иначе числовая ставка. */
const vatApiRate = (code: string): number | undefined => (code === 'none' ? undefined : vatRateOf(code));

/** Выпадающий список ставок НДС (единый для платежей/счетов/актов). */
function VatSelect({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldCls}>
      {VAT_OPTIONS.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
    </select>
  );
}

/** Выпадающий список НАШИХ юр. лиц (реквизиты, от кого ведём деятельность). */
function LegalEntitySelect({ entities, value, onChange, placeholder = '— выберите юр. лицо —' }: { entities: LegalEntity[]; value: string; onChange: (id: string) => void; placeholder?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldCls}>
      <option value="">{placeholder}</option>
      {entities.map((e) => <option key={e.id} value={e.id}>{e.name}{e.inn ? ` · ИНН ${e.inn}` : ''}</option>)}
    </select>
  );
}

/** Выпадающий список контрагентов-покупателей (агентства/компании) + добавление нового прямо здесь (§ покупатель). */
function CounterpartySelect({ items, value, onChange, onCreated }: { items: Counterparty[]; value: string; onChange: (id: string) => void; onCreated: (c: Counterparty) => void }) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'company' | 'agency'>('company');
  const [inn, setInn] = useState('');
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const c = await adminApi.financeCreateCounterparty({ name: name.trim(), kind, inn: inn || undefined });
      onCreated(c); onChange(c.id); setAdding(false); setName(''); setInn(''); setKind('company');
    } catch { /* ignore */ } finally { setBusy(false); }
  };
  if (adding) {
    return (
      <div className="space-y-2 rounded-md border border-ink/15 bg-ink/[0.02] p-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название контрагента" className={fieldCls} autoFocus />
        <div className="grid grid-cols-2 gap-2">
          <select value={kind} onChange={(e) => setKind(e.target.value as 'company' | 'agency')} className={fieldCls}><option value="company">Компания</option><option value="agency">Агентство</option></select>
          <input value={inn} onChange={(e) => setInn(e.target.value)} placeholder="ИНН" className={fieldCls} />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void create()} disabled={busy || !name.trim()} className="rounded-md bg-ink px-3 py-1.5 text-xs text-beige disabled:opacity-40">Добавить</button>
          <button type="button" onClick={() => setAdding(false)} className="rounded-md border border-ink/20 px-3 py-1.5 text-xs">Отмена</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={fieldCls}>
        <option value="">— выберите контрагента —</option>
        {items.map((c) => <option key={c.id} value={c.id}>{c.kind === 'agency' ? 'Агентство' : 'Компания'} · {c.name}{c.inn ? ` · ИНН ${c.inn}` : ''}</option>)}
      </select>
      <button type="button" onClick={() => setAdding(true)} title="Добавить контрагента" className="shrink-0 rounded-md border border-ink/20 px-2.5 text-sm text-primary hover:bg-primary-50">+ Новый</button>
    </div>
  );
}

/** Позиции по умолчанию для счёта/акта: проживание (посуточно) + доп-услуги брони. */
function defaultLines(b: PmsBooking): FinanceDocLine[] {
  const nights = b.priceBreakdown?.nights ?? [];
  const perNight = nights.length ? Math.round(b.totalPrice / nights.length) : b.totalPrice;
  const stay: FinanceDocLine = {
    name: `Проживание · ${b.roomType.name} · ${b.checkIn.slice(0, 10)}–${b.checkOut.slice(0, 10)}`,
    qty: b.nights, unit: 'сут.', price: perNight, vatRate: 0, amount: b.totalPrice,
  };
  const extras = (b.extras ?? []).map((e) => ({ name: e.name, qty: e.qty, unit: 'шт.', price: e.unitPrice, vatRate: 0, amount: e.total }));
  return [stay, ...extras];
}

/** Вкладка «Счёт»: разбивка по датам, сводка оплаты и документы (Платежи/Счета/Залог/Акты). */
export function FinanceTab({ b, onChanged }: { b: PmsBooking; onChanged: () => void }) {
  const [entities, setEntities] = useState<LegalEntity[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [selLe, setSelLe] = useState('');
  const [systems, setSystems] = useState<PaymentSystem[]>([]);
  const [pay, setPay] = useState<BookingPaymentInfo | null>(null);
  const [popup, setPopup] = useState<null | 'payments' | 'invoices' | 'deposit' | 'acts'>(null);
  const [counts, setCounts] = useState<{ payments: number; docs: number; acts: number; deposits: number }>({ payments: 0, docs: 0, acts: 0, deposits: 0 });

  const refresh = useCallback(() => {
    void adminApi.pmsBookingPaymentInfo(b.id).then(setPay).catch(() => undefined);
    void adminApi.pmsBookingPayments(b.id).then((p) => setCounts((c) => ({ ...c, payments: p.length }))).catch(() => undefined);
    void adminApi.pmsBookingDocs(b.id).then((d) => setCounts((c) => ({ ...c, docs: d.filter((x) => x.docType !== 'ACT').length, acts: d.filter((x) => x.docType === 'ACT').length }))).catch(() => undefined);
    void adminApi.pmsBookingDeposits(b.id).then((d) => setCounts((c) => ({ ...c, deposits: d.filter((x) => x.status === 'HELD').length }))).catch(() => undefined);
  }, [b.id]);
  useEffect(() => {
    void adminApi.financeLegalEntities().then(setEntities).catch(() => undefined);
    void adminApi.financeCounterparties().then(setCounterparties).catch(() => undefined);
    void adminApi.financePaymentSystems().then(setSystems).catch(() => undefined);
    refresh();
  }, [refresh]);
  const onCounterpartyCreated = (c: Counterparty) => setCounterparties((prev) => (prev.some((x) => x.id === c.id) ? prev : [...prev, c].sort((a, z) => a.name.localeCompare(z.name, 'ru'))));
  useEffect(() => {
    if (!entities.length) return;
    setSelLe((cur) => cur || entities.find((x) => x.isDefault)?.id || entities[0]!.id);
  }, [entities]);

  const total = b.totalPrice + b.extrasTotal;
  const nights = b.priceBreakdown?.nights ?? [];
  const surcharges = b.priceBreakdown?.surcharges ?? [];
  const printUrl = `/pms/invoice/${b.id}${selLe ? `?le=${selLe}` : ''}`;
  const ourLe = entities.find((e) => e.id === selLe) ?? null;

  const done = () => { refresh(); onChanged(); };

  return (
    <div className="max-w-3xl space-y-4">
      {/* Реквизиты + печать */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs text-dark-gray">Реквизиты (наше юр. лицо)</span>
          {entities.length === 0 ? (
            <span className="text-xs text-dark-gray">Нет реквизитов — добавьте в <a href="/settings/finance" target="_blank" rel="noreferrer" className="text-primary underline">Настройки → Финансы</a></span>
          ) : (
            <select value={selLe} onChange={(e) => setSelLe(e.target.value)} className="w-64 rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
              {entities.map((e) => <option key={e.id} value={e.id}>{e.name}{e.isDefault ? ' (по умолчанию)' : ''}</option>)}
            </select>
          )}
        </label>
        <a href={printUrl} target="_blank" rel="noreferrer" className="rounded-md border border-ink/20 px-3 py-2 text-sm text-ink hover:bg-ink/5">🖨 Счёт (PDF)</a>
      </div>

      {/* Разбивка стоимости по датам (6.1) */}
      <div className="rounded-xl border border-ink/10 p-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-dark-gray">Разбивка стоимости по датам</p>
        <table className="w-full text-sm">
          <tbody>
            {nights.length > 0 ? nights.map((n) => (
              <tr key={n.date} className="border-b border-ink/5 last:border-0">
                <td className="py-1.5 text-ink">{fmtDate(n.date)}<span className="ml-2 text-xs text-dark-gray">{['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][new Date(`${n.date.slice(0, 10)}T00:00:00Z`).getUTCDay()]}</span></td>
                <td className="py-1.5 text-right text-ink">{money(n.finalPrice)}</td>
              </tr>
            )) : (
              <tr className="border-b border-ink/5"><td className="py-1.5 text-ink">Проживание · {b.nights} ноч.</td><td className="py-1.5 text-right text-ink">{money(b.totalPrice)}</td></tr>
            )}
            {surcharges.map((s, i) => (
              <tr key={`s${i}`} className="border-b border-ink/5"><td className="py-1.5 text-ink">{s.type === 'early' ? 'Ранний заезд' : 'Поздний выезд'} ({s.percent}%)</td><td className="py-1.5 text-right text-ink">{money(s.amount)}</td></tr>
            ))}
            {(b.extras ?? []).map((e) => (
              <tr key={e.id} className="border-b border-ink/5"><td className="py-1.5 text-ink">{e.name}{e.qty > 1 ? ` × ${e.qty}` : ''}</td><td className="py-1.5 text-right text-ink">{money(e.total)}</td></tr>
            ))}
            <tr><td className="py-2 font-medium text-ink">Итого</td><td className="py-2 text-right text-lg font-medium text-ink">{money(total)}</td></tr>
          </tbody>
        </table>
      </div>

      {/* Сводка оплаты */}
      <div className="rounded-xl border border-ink/10 p-4">
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div><span className="block text-dark-gray">Итого</span><span className="font-medium text-ink">{money(total)}</span></div>
          <div><span className="block text-dark-gray">Оплачено</span><span className="font-medium text-emerald-700">{money(pay?.paid ?? 0)}</span></div>
          <div><span className="block text-dark-gray">Остаток</span><span className="font-medium text-ink">{money(pay?.remaining ?? total)}</span></div>
        </div>
        {pay && pay.prepayment > 0 ? <p className="mt-2 text-sm text-dark-gray">Предоплата по тарифу: <span className="font-medium text-ink">{money(pay.prepayment)}</span>{pay.guarantee?.dueTerm ? ` · ${pay.guarantee.dueTerm}` : ''}</p> : null}
      </div>

      {/* Кнопки-разделы (6.2) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SectionBtn label="Платежи" count={counts.payments} onClick={() => setPopup('payments')} />
        <SectionBtn label="Счета" count={counts.docs} onClick={() => setPopup('invoices')} />
        <SectionBtn label="Залог" count={counts.deposits} accent="amber" onClick={() => setPopup('deposit')} />
        <SectionBtn label="Акты" count={counts.acts} onClick={() => setPopup('acts')} />
      </div>

      {popup === 'payments' ? <PaymentsPopup b={b} pay={pay} counterparties={counterparties} onCounterpartyCreated={onCounterpartyCreated} ourLe={ourLe} onClose={() => setPopup(null)} onDone={done} /> : null}
      {popup === 'invoices' ? <DocsPopup b={b} kind="invoice" entities={entities} counterparties={counterparties} onCounterpartyCreated={onCounterpartyCreated} ourLe={ourLe} systems={systems} pay={pay} onClose={() => setPopup(null)} onDone={done} /> : null}
      {popup === 'acts' ? <DocsPopup b={b} kind="act" entities={entities} counterparties={counterparties} onCounterpartyCreated={onCounterpartyCreated} ourLe={ourLe} systems={systems} pay={pay} onClose={() => setPopup(null)} onDone={done} /> : null}
      {popup === 'deposit' ? <DepositPopup b={b} onClose={() => setPopup(null)} onDone={done} /> : null}
    </div>
  );
}

function SectionBtn({ label, count, accent, onClick }: { label: string; count: number; accent?: 'amber'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition hover:shadow-sm ${accent === 'amber' ? 'border-amber-300 bg-amber-50/50 hover:bg-amber-50' : 'border-ink/15 bg-white hover:bg-ink/[0.02]'}`}>
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className={`grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-semibold ${count > 0 ? 'bg-primary text-white' : 'bg-ink/10 text-dark-gray'}`}>{count}</span>
    </button>
  );
}

/** Обёртка попапа поверх окна брони. Esc закрывает только этот попап (§4). */
function Popup({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEsc(onClose);
  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" onClick={onClose}>
      <div className="my-2 w-full max-w-2xl rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink/10 px-5 py-3">
          <h3 className="text-lg font-light text-ink">{title}</h3>
          <button type="button" onClick={onClose} className="text-2xl leading-none text-ink/40 hover:text-ink">×</button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

/** Попап «Платежи»: регистрация оплаты на стойке (наличные/карта/безнал) + НДС + история.
 *  Онлайн-оплата (ссылка) перенесена в «Счета» → «Онлайн-оплата» (§8.1). */
function PaymentsPopup({ b, pay, counterparties, onCounterpartyCreated, ourLe, onClose, onDone }: { b: PmsBooking; pay: BookingPaymentInfo | null; counterparties: Counterparty[]; onCounterpartyCreated: (c: Counterparty) => void; ourLe: LegalEntity | null; onClose: () => void; onDone: () => void }) {
  const total = b.totalPrice + b.extrasTotal;
  const [rows, setRows] = useState<BookingPayment[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // Форма ручной оплаты
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'card' | 'transfer' | 'other'>('cash');
  const [payerType, setPayerType] = useState<'individual' | 'legal'>('individual');
  const [payerName, setPayerName] = useState(`${b.guest?.lastName ?? ''} ${b.guest?.firstName ?? ''}`.trim());
  const [payerLeId, setPayerLeId] = useState('');
  const [settlement, setSettlement] = useState('full');
  const [vat, setVat] = useState(vatCodeFromRate(ourLe?.defaultVatRate));
  const [paidAt, setPaidAt] = useState(todayIso());

  useEffect(() => setVat(vatCodeFromRate(ourLe?.defaultVatRate)), [ourLe?.defaultVatRate]);
  const load = () => void adminApi.pmsBookingPayments(b.id).then(setRows).catch(() => undefined);
  useEffect(load, [b.id]);

  const record = async () => {
    const amt = Math.round(Number(amount || (pay?.remaining ?? total)));
    if (!amt || amt <= 0) { setMsg('Укажите сумму больше нуля'); return; }
    const name = payerType === 'legal' ? (counterparties.find((c) => c.id === payerLeId)?.name ?? payerName) : payerName;
    setBusy(true); setMsg('');
    try {
      await adminApi.pmsRecordManualPayment(b.id, { amount: amt, method, payerType, payerName: name || undefined, settlementKind: settlement, vatRate: vatApiRate(vat), paidAt });
      setAmount(''); load(); onDone();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };

  return (
    <Popup title="Платежи" onClose={onClose}>
      <div className="mb-4 grid grid-cols-3 gap-2 rounded-lg bg-ink/[0.03] p-3 text-sm">
        <div><span className="block text-dark-gray">Итого</span><span className="font-medium text-ink">{money(total)}</span></div>
        <div><span className="block text-dark-gray">Оплачено</span><span className="font-medium text-emerald-700">{money(pay?.paid ?? 0)}</span></div>
        <div><span className="block text-dark-gray">Остаток</span><span className="font-medium text-ink">{money(pay?.remaining ?? total)}</span></div>
      </div>

      <p className="mb-3 text-xs text-dark-gray">Онлайн-оплата ссылкой гостю — во вкладке «Счета» → «Онлайн-оплата».</p>

      {/* Оплата на стойке */}
      <div className="mb-4 rounded-lg border border-dashed border-ink/25 p-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-dark-gray">Добавить платёж (на стойке)</p>
        <div className="mb-2 flex gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" checked={payerType === 'individual'} onChange={() => setPayerType('individual')} /> Физическое лицо</label>
          <label className="flex items-center gap-1.5"><input type="radio" checked={payerType === 'legal'} onChange={() => setPayerType('legal')} /> Юридическое лицо</label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="text-sm"><span className="mb-1 block text-xs text-dark-gray">{payerType === 'legal' ? 'Плательщик (контрагент)' : 'ФИО плательщика'}</span>
            {payerType === 'legal'
              ? <CounterpartySelect items={counterparties} value={payerLeId} onChange={setPayerLeId} onCreated={onCounterpartyCreated} />
              : <input value={payerName} onChange={(e) => setPayerName(e.target.value)} className={fieldCls} />}
          </label>
          <label className="text-sm"><span className="mb-1 block text-xs text-dark-gray">Способ оплаты</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={fieldCls}>{(['cash', 'card', 'transfer', 'other'] as const).map((m) => <option key={m} value={m}>{PAY_METHOD_LABEL[m]}</option>)}</select>
          </label>
          <label className="text-sm"><span className="mb-1 block text-xs text-dark-gray">Признак способа расчёта</span>
            <select value={settlement} onChange={(e) => setSettlement(e.target.value)} className={fieldCls}>{Object.entries(SETTLEMENT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label className="text-sm"><span className="mb-1 block text-xs text-dark-gray">НДС</span><VatSelect value={vat} onChange={setVat} /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-dark-gray">Дата платежа</span><DatePicker value={paidAt} onChange={(v) => v && setPaidAt(v)} /></label>
          <label className="text-sm"><span className="mb-1 block text-xs text-dark-gray">Сумма к оплате, ₽</span><input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(pay?.remaining ?? total)} className={fieldCls} /></label>
        </div>
        <button type="button" onClick={() => void record()} disabled={busy} className="mt-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40">Внести оплату</button>
      </div>

      {msg ? <p className="mb-2 text-sm text-amber-700">{msg}</p> : null}

      {/* История */}
      <p className="mb-1 text-xs uppercase tracking-wide text-dark-gray">История платежей</p>
      {rows.length === 0 ? <p className="text-sm text-dark-gray">Платежей нет.</p> : (
        <table className="w-full text-sm">
          <tbody>
            {rows.map((p) => {
              const st = PAY_STATUS[p.status] ?? { label: p.status, cls: 'bg-ink/10 text-dark-gray' };
              const src = p.manual ? `Стойка · ${PAY_METHOD_LABEL[p.method ?? 'other'] ?? p.method}` : p.provider === 'yookassa' ? 'ЮKassa' : p.provider;
              return (
                <tr key={p.id} className="border-b border-ink/5 last:border-0">
                  <td className="py-1.5 text-dark-gray">{fmtDate(p.paidAt ?? p.createdAt)}</td>
                  <td className="py-1.5 text-ink">{src}{p.payerName ? ` · ${p.payerName}` : ''}{p.settlementKind ? ` · ${SETTLEMENT_LABEL[p.settlementKind] ?? p.settlementKind}` : ''}{p.vatRate != null ? ` · НДС ${p.vatRate}%` : ''}</td>
                  <td className="py-1.5"><span className={`rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span></td>
                  <td className="py-1.5 text-right font-medium text-ink">{money(p.amount)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Popup>
  );
}

/**
 * Попап «Счета» / «Акты» — форма создания открывается сразу (§9.1/10.1).
 * «Счета»: Счёт / Квитанция (документ) или Онлайн-оплата (ссылка платёжной системы, §9.4).
 * Покупатель-юрлицо — из справочника (§6); НДС — выпадающим списком (§9.2/10.3).
 */
function DocsPopup({ b, kind, entities, counterparties, onCounterpartyCreated, ourLe, systems, pay, onClose, onDone }: { b: PmsBooking; kind: 'invoice' | 'act'; entities: LegalEntity[]; counterparties: Counterparty[]; onCounterpartyCreated: (c: Counterparty) => void; ourLe: LegalEntity | null; systems: PaymentSystem[]; pay: BookingPaymentInfo | null; onClose: () => void; onDone: () => void }) {
  const isAct = kind === 'act';
  const total = b.totalPrice + b.extrasTotal;
  const [rows, setRows] = useState<FinanceDoc[]>([]);
  const [creating, setCreating] = useState(true); // §9.1/10.1 — сразу форма создания
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Форма документа
  const [docType, setDocType] = useState<'INVOICE' | 'RECEIPT' | 'ONLINE' | 'ACT'>(isAct ? 'ACT' : 'INVOICE');
  const [buyerType, setBuyerType] = useState<'individual' | 'legal'>('individual');
  const [buyerName, setBuyerName] = useState(`${b.guest?.lastName ?? ''} ${b.guest?.firstName ?? ''}`.trim());
  const [buyerLeId, setBuyerLeId] = useState('');
  const [ourLeId, setOurLeId] = useState(ourLe?.id ?? entities.find((e) => e.isDefault)?.id ?? entities[0]?.id ?? '');
  const [vat, setVat] = useState(vatCodeFromRate(ourLe?.defaultVatRate));
  const [docDate, setDocDate] = useState(todayIso());
  const [dueDate, setDueDate] = useState('');
  const [message, setMessage] = useState('');
  const [lines, setLines] = useState<FinanceDocLine[]>(() => defaultLines(b));
  // Онлайн-оплата (ссылка)
  const [sysId, setSysId] = useState(systems.find((s) => s.active)?.id ?? systems[0]?.id ?? '');
  const [payAmount, setPayAmount] = useState('');
  const [link, setLink] = useState<{ url: string; amount: number; system?: string } | null>(null);

  useEffect(() => setVat(vatCodeFromRate(ourLe?.defaultVatRate)), [ourLe?.defaultVatRate]);
  const load = () => void adminApi.pmsBookingDocs(b.id).then((d) => setRows(d.filter((x) => (isAct ? x.docType === 'ACT' : x.docType !== 'ACT')))).catch(() => undefined);
  useEffect(load, [b.id]);

  const docTotal = useMemo(() => lines.reduce((s, l) => s + (Number(l.amount) || 0), 0), [lines]);
  const setLine = (i: number, patch: Partial<FinanceDocLine>) => setLines((ls) => ls.map((l, idx) => {
    if (idx !== i) return l;
    const next = { ...l, ...patch };
    if (patch.qty !== undefined || patch.price !== undefined) next.amount = Math.round((Number(next.qty) || 1) * (Number(next.price) || 0));
    return next;
  }));

  const submitDoc = async () => {
    const name = buyerType === 'legal' ? (counterparties.find((c) => c.id === buyerLeId)?.name ?? buyerName) : buyerName;
    const rate = vatApiRate(vat);
    setBusy(true); setErr('');
    try {
      await adminApi.pmsCreateDoc(b.id, {
        docType, buyerType, buyerName: name || undefined,
        buyerLegalEntityId: buyerType === 'legal' ? (buyerLeId || undefined) : undefined,
        ourLegalEntityId: ourLeId || undefined,
        message: message || undefined, docDate, dueDate: dueDate || undefined,
        lines: lines.map((l) => ({ ...l, qty: Number(l.qty) || 1, price: Number(l.price) || 0, amount: Number(l.amount) || 0, vatRate: rate ?? 0 })),
      });
      load(); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };

  // §9.4 — «Онлайн-оплата» создаёт ссылку платёжной системы, а не документ.
  const issueLink = async () => {
    const amt = payAmount ? Math.round(Number(payAmount)) : undefined;
    setBusy(true); setErr(''); setLink(null);
    try {
      const r = await adminApi.pmsBookingPaymentLink(b.id, { kind: amt ? undefined : 'full', amount: amt, system: sysId || undefined });
      if (r.error) setErr(r.error);
      else if (r.confirmationUrl) setLink({ url: r.confirmationUrl, amount: r.amount ?? 0, system: r.system });
      else setErr('Ссылка создана, но URL недоступен (проверьте настройку эквайера в Настройки → Финансы).');
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };

  const cancel = async (id: string) => { await adminApi.pmsCancelDoc(id); load(); onDone(); };
  const isOnline = !isAct && docType === 'ONLINE';

  return (
    <Popup title={isAct ? 'Акты' : 'Счета'} onClose={onClose}>
      <div className="space-y-3 text-sm">
        {/* Тип документа (только для «Счетов») */}
        {!isAct ? (
          <div className="flex flex-wrap gap-4">
            {(['INVOICE', 'RECEIPT', 'ONLINE'] as const).map((t) => (
              <label key={t} className="flex items-center gap-1.5"><input type="radio" checked={docType === t} onChange={() => setDocType(t)} /> {DOC_TYPE_LABEL[t]}</label>
            ))}
          </div>
        ) : null}

        {isOnline ? (
          /* ─── Онлайн-оплата: ссылка платёжной системы (§9.3/9.4) ─── */
          <div className="space-y-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <label><span className="mb-1 block text-xs text-dark-gray">Платёжная система</span>
                {systems.length === 0 ? (
                  <span className="block py-2 text-xs text-dark-gray">Нет включённых ПС — подключите в <a href="/settings/finance" target="_blank" rel="noreferrer" className="text-primary underline">Настройки → Финансы</a></span>
                ) : (
                  <select value={sysId} onChange={(e) => setSysId(e.target.value)} className={fieldCls}>
                    {systems.map((s) => <option key={s.id} value={s.id}>{s.name}{s.active ? ' (активная)' : ''}</option>)}
                  </select>
                )}
              </label>
              <label><span className="mb-1 block text-xs text-dark-gray">Сумма ссылки, ₽</span><input type="number" min={1} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={String(pay?.remaining ?? total)} className={fieldCls} /></label>
            </div>
            <p className="text-[11px] text-dark-gray">Ссылку формирует активный эквайер; выбранная ПС фиксируется для отображения. Гость оплачивает картой/СБП по ссылке.</p>
            <button type="button" onClick={() => void issueLink()} disabled={busy || systems.length === 0} className="rounded-md bg-ink px-4 py-2 text-sm text-beige disabled:opacity-40">{busy ? 'Создание…' : 'Создать ссылку на оплату'}</button>
            {link ? (
              <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-2 text-xs">
                <input readOnly value={link.url} className="flex-1 rounded border border-ink/20 bg-white px-2 py-1" onFocus={(e) => e.target.select()} />
                <button type="button" onClick={() => void navigator.clipboard?.writeText(link.url)} className="rounded border border-ink/20 px-2 py-1 hover:bg-white">Копировать</button>
              </div>
            ) : null}
          </div>
        ) : (
          /* ─── Счёт / Квитанция / Акт: документ ─── */
          <>
            <div className="flex gap-4">
              <span className="text-dark-gray">Покупатель:</span>
              <label className="flex items-center gap-1.5"><input type="radio" checked={buyerType === 'individual'} onChange={() => setBuyerType('individual')} /> Физ. лицо</label>
              <label className="flex items-center gap-1.5"><input type="radio" checked={buyerType === 'legal'} onChange={() => setBuyerType('legal')} /> Юр. лицо</label>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label><span className="mb-1 block text-xs text-dark-gray">{buyerType === 'legal' ? 'Покупатель (контрагент)' : 'ФИО плательщика'}</span>
                {buyerType === 'legal'
                  ? <CounterpartySelect items={counterparties} value={buyerLeId} onChange={setBuyerLeId} onCreated={onCounterpartyCreated} />
                  : <input value={buyerName} onChange={(e) => setBuyerName(e.target.value)} className={fieldCls} />}
              </label>
              <label><span className="mb-1 block text-xs text-dark-gray">Наше юр. лицо</span>
                <LegalEntitySelect entities={entities} value={ourLeId} onChange={setOurLeId} placeholder="— по умолчанию —" />
              </label>
              <label><span className="mb-1 block text-xs text-dark-gray">НДС</span><VatSelect value={vat} onChange={setVat} /></label>
              <label><span className="mb-1 block text-xs text-dark-gray">{isAct ? 'Дата акта' : 'Дата счёта'}</span><DatePicker value={docDate} onChange={(v) => v && setDocDate(v)} /></label>
              {!isAct ? <label className="sm:col-span-1"><span className="mb-1 block text-xs text-dark-gray">Оплата до</span><DatePicker value={dueDate} onChange={(v) => setDueDate(v)} /></label> : null}
            </div>

            {/* Позиции */}
            <div className="rounded-lg border border-ink/10 p-2">
              <div className="grid grid-cols-[1fr_56px_80px_90px] gap-1 border-b border-ink/10 pb-1 text-[11px] uppercase text-dark-gray">
                <span>Наименование</span><span className="text-center">Кол-во</span><span className="text-right">Цена</span><span className="text-right">Сумма</span>
              </div>
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_56px_80px_90px] items-center gap-1 border-b border-ink/5 py-1">
                  <input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} className="rounded border border-ink/15 px-2 py-1 text-xs" />
                  <input type="number" min={1} value={l.qty ?? 1} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} className="rounded border border-ink/15 px-1 py-1 text-center text-xs" />
                  <input type="number" value={l.price} onChange={(e) => setLine(i, { price: Number(e.target.value) })} className="rounded border border-ink/15 px-1 py-1 text-right text-xs" />
                  <div className="flex items-center justify-end gap-1"><span className="text-xs text-ink">{money(l.amount)}</span><button type="button" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} className="text-ink/40 hover:text-red-600">×</button></div>
                </div>
              ))}
              <button type="button" onClick={() => setLines((ls) => [...ls, { name: '', qty: 1, price: 0, vatRate: 0, amount: 0 }])} className="mt-1 text-xs text-primary underline">+ строка</button>
              <div className="mt-1 flex justify-between border-t border-ink/10 pt-1 text-sm font-medium text-ink"><span>Всего к оплате{vat !== 'none' ? ` (${VAT_OPTIONS.find((o) => o.code === vat)?.label})` : ''}</span><span>{money(docTotal)}</span></div>
            </div>

            {!isAct ? <label className="block"><span className="mb-1 block text-xs text-dark-gray">Сообщение (необязательно)</span><textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className={fieldCls} /></label> : null}
            <button type="button" onClick={() => void submitDoc()} disabled={busy} className="rounded-md bg-ink px-4 py-2 text-sm text-beige disabled:opacity-40">{busy ? 'Сохранение…' : `Создать ${isAct ? 'акт' : (DOC_TYPE_LABEL[docType] ?? 'документ').toLowerCase()}`}</button>
          </>
        )}

        {err ? <p className="text-sm text-red-600">{err}</p> : null}

        {/* Список ранее созданных документов */}
        <div className="border-t border-ink/10 pt-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs uppercase tracking-wide text-dark-gray">{isAct ? 'Акты' : 'Счета'} по брони</p>
            <button type="button" onClick={() => setCreating((v) => !v)} className="text-xs text-primary hover:underline">{creating ? 'Свернуть форму' : '+ Ещё документ'}</button>
          </div>
          {rows.length === 0 ? <p className="text-sm text-dark-gray">{isAct ? 'Актов' : 'Счетов'} пока нет.</p> : (
            <div className="space-y-2">
              {rows.map((d) => (
                <div key={d.id} className={`rounded-lg border border-ink/10 p-3 text-sm ${d.status === 'CANCELLED' ? 'opacity-50' : ''}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink">{DOC_TYPE_LABEL[d.docType]} № {d.number}</span>
                    <span className="text-dark-gray">{fmtDate(d.docDate)} · {money(d.total)}{d.vatTotal > 0 ? ` · НДС ${money(d.vatTotal)}` : ''}</span>
                  </div>
                  <p className="text-xs text-dark-gray">{d.buyerType === 'legal' ? 'Юр. лицо' : 'Физ. лицо'}{d.buyerName ? ` · ${d.buyerName}` : ''}{d.dueDate ? ` · оплата до ${fmtDate(d.dueDate)}` : ''}{d.status === 'CANCELLED' ? ' · аннулирован' : ''}</p>
                  {d.status !== 'CANCELLED' ? (
                    <div className="mt-1.5 flex gap-3 text-xs">
                      <button type="button" onClick={() => window.print()} className="text-primary underline">Печать</button>
                      <button type="button" onClick={() => void cancel(d.id)} className="text-red-600 underline">Аннулировать</button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Popup>
  );
}

/** Попап «Залог»: преавторизация карты / ручной приём, сумма из настроек или вручную, разрешение при выезде. */
function DepositPopup({ b, onClose, onDone }: { b: PmsBooking; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Deposit[]>([]);
  const [def, setDef] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [type, setType] = useState<'CARD_HOLD' | 'MANUAL'>('CARD_HOLD');
  const [method, setMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [capture, setCapture] = useState<Record<string, string>>({});

  const load = () => void adminApi.pmsBookingDeposits(b.id).then(setRows).catch(() => undefined);
  useEffect(() => {
    load();
    void adminApi.pmsDepositDefault(b.id).then((d) => { setDef(d.amount); setAmount(d.amount ? String(d.amount) : ''); }).catch(() => undefined);
  }, [b.id]);

  const create = async () => {
    const amt = Math.round(Number(amount || def));
    if (!amt || amt <= 0) { setErr('Укажите сумму залога'); return; }
    setBusy(true); setErr('');
    try {
      await adminApi.pmsCreateDeposit(b.id, { type, method: type === 'MANUAL' ? method : undefined, amount: amt, note: note || undefined });
      setNote(''); load(); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };
  const resolve = async (dep: Deposit, action: 'release' | 'capture' | 'refund') => {
    setBusy(true);
    try {
      await adminApi.pmsResolveDeposit(dep.id, { action, capturedAmount: action === 'capture' ? Math.round(Number(capture[dep.id] || dep.amount)) : undefined });
      load(); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Ошибка'); } finally { setBusy(false); }
  };

  return (
    <Popup title="Залог (обеспечительный платёж)" onClose={onClose}>
      <div className="mb-4 rounded-lg border border-dashed border-ink/25 p-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-dark-gray">Оформить залог</p>
        <div className="mb-2 flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-1.5"><input type="radio" checked={type === 'CARD_HOLD'} onChange={() => setType('CARD_HOLD')} /> Преавторизация карты (hold)</label>
          <label className="flex items-center gap-1.5"><input type="radio" checked={type === 'MANUAL'} onChange={() => setType('MANUAL')} /> Ручной приём</label>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {type === 'MANUAL' ? (
            <label className="text-sm"><span className="mb-1 block text-xs text-dark-gray">Способ</span>
              <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className={fieldCls}>{(['cash', 'card', 'transfer'] as const).map((m) => <option key={m} value={m}>{PAY_METHOD_LABEL[m]}</option>)}</select>
            </label>
          ) : null}
          <label className="text-sm"><span className="mb-1 block text-xs text-dark-gray">Сумма залога, ₽{def ? ` (по умолч. ${money(def)})` : ''}</span><input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={fieldCls} /></label>
          <label className="text-sm sm:col-span-1"><span className="mb-1 block text-xs text-dark-gray">Примечание</span><input value={note} onChange={(e) => setNote(e.target.value)} className={fieldCls} /></label>
        </div>
        <p className="mt-1.5 text-[11px] text-dark-gray">{type === 'CARD_HOLD' ? 'Блокировка суммы на карте гостя (международный стандарт): снимается при выезде без ущерба, при ущербе — списывается.' : 'Приём залога на стойке; возврат/списание фиксируется при выезде.'}</p>
        <button type="button" onClick={() => void create()} disabled={busy} className="mt-2 rounded-md bg-amber-600 px-3 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-40">Оформить залог</button>
        {err ? <p className="mt-1 text-sm text-red-600">{err}</p> : null}
      </div>

      {rows.length === 0 ? <p className="text-sm text-dark-gray">Залогов нет.</p> : (
        <div className="space-y-2">
          {rows.map((d) => {
            const st = DEP_STATUS[d.status] ?? { label: d.status, cls: 'bg-ink/10 text-dark-gray' };
            return (
              <div key={d.id} className="rounded-lg border border-ink/10 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink">{d.type === 'CARD_HOLD' ? 'Преавторизация карты' : `Ручной · ${PAY_METHOD_LABEL[d.method ?? 'cash']}`}</span>
                  <span className="flex items-center gap-2">{money(d.amount)}<span className={`rounded-full px-2 py-0.5 text-[11px] ${st.cls}`}>{st.label}</span></span>
                </div>
                {d.note ? <p className="text-xs text-dark-gray">{d.note}</p> : null}
                {d.status === 'CAPTURED' && d.capturedAmount > 0 ? <p className="text-xs text-rose-600">Удержано: {money(d.capturedAmount)}</p> : null}
                {d.status === 'HELD' ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => void resolve(d, 'release')} disabled={busy} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs text-white disabled:opacity-40">{d.type === 'CARD_HOLD' ? 'Снять блокировку' : 'Вернуть'}</button>
                    <div className="flex items-center gap-1">
                      <input type="number" placeholder={String(d.amount)} value={capture[d.id] ?? ''} onChange={(e) => setCapture((c) => ({ ...c, [d.id]: e.target.value }))} className="w-24 rounded border border-ink/20 px-2 py-1 text-xs" />
                      <button type="button" onClick={() => void resolve(d, 'capture')} disabled={busy} className="rounded-md bg-rose-600 px-2.5 py-1 text-xs text-white disabled:opacity-40">Удержать (ущерб)</button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Popup>
  );
}
