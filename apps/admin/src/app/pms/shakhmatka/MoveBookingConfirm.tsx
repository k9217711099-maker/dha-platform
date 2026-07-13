'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@dha/ui';
import { adminApi, type PmsBooking, type PmsRatePlan, type PmsRoom } from '../../../lib/api';
import { useEsc } from '../../../lib/use-esc';
import { guestName, money } from './booking-view';

export interface MoveTarget {
  booking: PmsBooking;
  /** Целевой номер (null — оставить/перенести без назначенного номера). */
  roomId: string | null;
  room: PmsRoom | null;
  /** Целевой объект (при переносе в другой объект). */
  propertyId?: string;
  propertyName?: string;
  /** Целевая категория (при переносе в категорию без номера). */
  roomTypeId?: string;
  roomTypeName?: string;
  checkIn: string;
  checkOut: string;
}

const nightsOf = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
const fmt = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });

/** Подтверждение переноса брони на шахматке: показывает изменения (номер/категория/даты)
 *  и пересчитанную Rate Engine цену до применения (§1). */
export function MoveBookingConfirm({ target, onClose, onDone, onError }: {
  target: MoveTarget; onClose: () => void; onDone: () => void; onError: (m: string) => void;
}) {
  useEsc(onClose);
  const b = target.booking;
  const oldIn = b.checkIn.slice(0, 10), oldOut = b.checkOut.slice(0, 10);
  const datesChanged = target.checkIn !== oldIn || target.checkOut !== oldOut;
  const newPropertyId = target.propertyId ?? target.room?.property.id ?? b.property.id;
  const newPropertyName = target.propertyName ?? target.room?.property.name ?? b.property.name;
  const propertyChanged = newPropertyId !== b.property.id;
  const newRoomTypeId = target.roomTypeId ?? target.room?.roomType.id ?? b.roomType.id;
  const newRoomTypeName = target.roomTypeName ?? target.room?.roomType.name ?? b.roomType.name;
  const roomTypeChanged = newRoomTypeId !== b.roomType.id;
  const roomChanged = (target.roomId ?? null) !== (b.roomId ?? null);
  const oldNights = nightsOf(oldIn, oldOut);
  const newNights = nightsOf(target.checkIn, target.checkOut);
  // При смене категории/объекта спрашиваем: оставить цену или пересчитать по новой категории (§1).
  const catOrPropChanged = roomTypeChanged || propertyChanged;

  const [plans, setPlans] = useState<PmsRatePlan[]>([]);
  const [quote, setQuote] = useState<number | 'loading' | null>(null);
  const [pricingMode, setPricingMode] = useState<'keep' | 'recalc'>('recalc');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { void adminApi.pmsRatePlans().then((p) => setPlans(p.filter((x) => x.active))).catch(() => setPlans([])); }, []);
  // Тариф для пересчёта: текущий тариф брони, если применим к новому объекту, иначе первый доступный.
  const targetPlan = useMemo(() => {
    const applic = plans.filter((p) => p.propertyId === null || p.propertyId === newPropertyId);
    return applic.find((p) => p.id === b.ratePlanId) ?? applic[0] ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans, newPropertyId, b.ratePlanId]);

  // Пересчёт цены Rate Engine по НОВОЙ категории/объекту/датам/числу гостей.
  useEffect(() => {
    if (!targetPlan || !(datesChanged || catOrPropChanged)) { setQuote(null); return; }
    setQuote('loading');
    void adminApi.pmsQuote({ propertyId: newPropertyId, roomTypeId: newRoomTypeId, ratePlanId: targetPlan.id, checkIn: target.checkIn, checkOut: target.checkOut, guests: b.guests })
      .then((q) => setQuote(q.totalAmount))
      .catch(() => setQuote(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.checkIn, target.checkOut, newRoomTypeId, newPropertyId, targetPlan?.id]);

  const newPrice = typeof quote === 'number' ? quote : null;
  const priceDelta = newPrice != null ? newPrice - b.totalPrice : 0;
  const canRecalc = !!targetPlan && newPrice != null;
  const effectiveMode: 'keep' | 'recalc' = canRecalc ? pricingMode : 'keep';

  const confirm = async () => {
    setBusy(true); setErr('');
    const body: { checkIn?: string; checkOut?: string; propertyId?: string; roomTypeId?: string; roomId?: string; ratePlanId?: string; totalPrice?: number } = {};
    if (datesChanged) { body.checkIn = target.checkIn; body.checkOut = target.checkOut; }
    if (propertyChanged) body.propertyId = newPropertyId;
    if (roomTypeChanged) body.roomTypeId = newRoomTypeId;
    if (roomChanged && target.roomId) body.roomId = target.roomId;
    // Смена категории/объекта: явный выбор оператора — пересчитать (передаём тариф → Rate Engine) или оставить цену.
    if (catOrPropChanged) {
      if (effectiveMode === 'recalc' && targetPlan) body.ratePlanId = targetPlan.id;
      else body.totalPrice = b.totalPrice;
    }
    try {
      await adminApi.pmsUpdateBooking(b.id, body);
      onDone();
    } catch (e) {
      const m = e instanceof Error ? e.message : 'Не удалось перенести бронь';
      setErr(m); onError(m); setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-xl font-light text-ink">Перенести бронь?</h2>
        <p className="mb-4 text-sm text-dark-gray">{guestName(b)} · № {b.bookingNumber ?? '—'}</p>

        <div className="space-y-2 rounded-xl border border-ink/10 p-4 text-sm">
          {propertyChanged ? (
            <ChangeRow label="Объект" from={b.property.name} to={newPropertyName} />
          ) : null}
          {roomChanged || roomTypeChanged ? (
            <ChangeRow label={roomTypeChanged ? 'Номер / категория' : 'Номер'}
              from={`${b.room?.number ? `№${b.room.number}` : 'не назначен'} · ${b.roomType.name}`}
              to={`${target.room ? `№${target.room.number}` : 'не назначен'} · ${newRoomTypeName}`} />
          ) : (
            <div className="flex justify-between"><span className="text-dark-gray">Номер</span><span className="text-ink">{b.room?.number ? `№${b.room.number}` : 'не назначен'} (без изменений)</span></div>
          )}
          {datesChanged ? (
            <ChangeRow label="Даты" from={`${fmt(oldIn)} — ${fmt(oldOut)} · ${oldNights} ноч.`} to={`${fmt(target.checkIn)} — ${fmt(target.checkOut)} · ${newNights} ноч.`} />
          ) : (
            <div className="flex justify-between"><span className="text-dark-gray">Даты</span><span className="text-ink">{fmt(oldIn)} — {fmt(oldOut)} (без изменений)</span></div>
          )}
          {propertyChanged ? <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-700">Перенос в другой объект: назначенный номер сбрасывается (нужно выбрать номер нового объекта).</p> : null}

          {/* Цена — при смене категории/объекта спрашиваем: оставить или пересчитать (§1) */}
          <div className="mt-1 border-t border-ink/10 pt-2">
            {catOrPropChanged ? (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wide text-dark-gray">Стоимость при переносе</p>
                <label className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 ${effectiveMode === 'keep' ? 'border-ink bg-ink/[0.03]' : 'border-ink/15'}`}>
                  <span className="flex items-center gap-2 text-sm text-ink"><input type="radio" checked={effectiveMode === 'keep'} onChange={() => setPricingMode('keep')} /> Оставить прежней</span>
                  <span className="text-sm font-medium text-ink">{money(b.totalPrice)}</span>
                </label>
                <label className={`flex cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 ${!canRecalc ? 'cursor-not-allowed opacity-50' : ''} ${effectiveMode === 'recalc' ? 'border-ink bg-ink/[0.03]' : 'border-ink/15'}`}>
                  <span className="flex items-center gap-2 text-sm text-ink"><input type="radio" disabled={!canRecalc} checked={effectiveMode === 'recalc'} onChange={() => setPricingMode('recalc')} /> Пересчитать по новой категории<span className="text-xs text-dark-gray">· {newNights} ноч. · {b.guests} гост.</span></span>
                  <span className="text-sm font-medium text-ink">{quote === 'loading' ? '…' : newPrice != null ? <>{money(newPrice)}{priceDelta !== 0 ? <span className={priceDelta > 0 ? 'ml-1 text-red-600' : 'ml-1 text-emerald-600'}>({priceDelta > 0 ? '+' : '−'}{money(Math.abs(priceDelta))})</span> : null}</> : '—'}</span>
                </label>
                {!canRecalc && quote !== 'loading' ? <p className="text-[11px] text-amber-700">Пересчёт недоступен (нет тарифа/цены для новой категории на эти даты) — стоимость останется прежней.</p> : null}
                {targetPlan && canRecalc ? <p className="text-[11px] text-dark-gray">Пересчёт по тарифу «{targetPlan.name}» с учётом дат и числа гостей.</p> : null}
              </div>
            ) : quote === 'loading' ? (
              <div className="flex justify-between"><span className="text-dark-gray">Пересчёт цены…</span><span className="text-dark-gray">Rate Engine</span></div>
            ) : newPrice != null && datesChanged ? (
              <>
                <div className="flex justify-between"><span className="text-dark-gray">Было</span><span className="text-ink">{money(b.totalPrice)}</span></div>
                <div className="flex justify-between"><span className="text-dark-gray">Станет</span><span className="font-medium text-ink">{money(newPrice)}{priceDelta !== 0 ? <span className={priceDelta > 0 ? 'ml-1 text-red-600' : 'ml-1 text-emerald-600'}>({priceDelta > 0 ? '+' : '−'}{money(Math.abs(priceDelta))})</span> : null}</span></div>
              </>
            ) : (
              <div className="flex justify-between"><span className="text-dark-gray">Цена</span><span className="text-ink">{money(b.totalPrice)} — без изменений</span></div>
            )}
          </div>
        </div>

        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Отмена</Button>
          <Button onClick={() => void confirm()} disabled={busy}>{busy ? 'Перенос…' : 'Перенести'}</Button>
        </div>
      </div>
    </div>
  );
}

function ChangeRow({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-dark-gray">{label}</span>
      <span className="text-right text-ink"><span className="text-dark-gray line-through">{from}</span><br />{to}</span>
    </div>
  );
}
