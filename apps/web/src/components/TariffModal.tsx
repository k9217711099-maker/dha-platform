'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@dha/ui';
import { api } from '../lib/api';
import { computeExtraTotal, nightsBetween, UNIT_LABEL } from '../lib/extras';
import type { CartExtra } from '../lib/cart-context';
import type { Extra, RatePlan, RoomAvailability } from '../lib/api-types';
import type { SearchCtx } from './RoomResultCard';

interface Props {
  room: RoomAvailability;
  propertyName: string;
  cashbackPercent: number;
  isGuest: boolean;
  ctx: SearchCtx;
  onAdd: (room: RoomAvailability, ratePlanId: string, extras: CartExtra[]) => void;
  onClose: () => void;
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mt-0.5 shrink-0 text-dark-gray">
      <path d={d} />
    </svg>
  );
}

export function TariffModal({ room, propertyName, cashbackPercent, isGuest, ctx, onAdd, onClose }: Props) {
  const [rate, setRate] = useState<RatePlan | null>(null);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [openInfo, setOpenInfo] = useState<string | null>(null);

  const nights = nightsBetween(ctx.checkIn, ctx.checkOut);
  const guests = ctx.guests;

  useEffect(() => {
    api.getExtras().then(setExtras).catch(() => setExtras([]));
  }, []);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => ev.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Доступные услуги: по категории номера и периодам действия
  const applicable = extras.filter(
    (e) =>
      (e.roomTypeIds.length === 0 || e.roomTypeIds.includes(room.roomTypeId)) &&
      (!e.periods || e.periods.length === 0 || e.periods.some((p) => p.from <= ctx.checkOut && p.until >= ctx.checkIn)),
  );

  // Услуга включена в выбранный тариф, если ID тарифа оканчивается на «-<kind>».
  // (ID тарифа Bnovo = `<кодНомера>-<kind>`, напр. `bnovo-room-1-standard`.)
  const isIncludedForRate = (e: Extra) =>
    rate != null && (e.includedRatePlanKinds ?? []).some((k) => rate.id.endsWith(`-${k}`));

  // Услуги, включённые в выбранный тариф (бесплатно), и платные
  const included = applicable.filter(isIncludedForRate);
  const includedIds = new Set(included.map((e) => e.id));
  const paid = applicable.filter((e) => !includedIds.has(e.id));

  function toggleExtra(e: Extra) {
    setSelected((s) => {
      const next = { ...s };
      if (next[e.id]) delete next[e.id];
      else next[e.id] = 1;
      return next;
    });
  }
  function setQty(e: Extra, qty: number) {
    const max = e.maxQty && e.maxQty > 0 ? e.maxQty : 99;
    setSelected((s) => ({ ...s, [e.id]: Math.max(1, Math.min(qty, max)) }));
  }

  const cartExtras: CartExtra[] = extras
    .filter((e) => selected[e.id] && !includedIds.has(e.id))
    .map((e) => {
      const qty = e.quantitySelectable ? selected[e.id]! : 1;
      return { extraId: e.id, name: e.name, unit: e.unit, unitPrice: e.price, qty, total: computeExtraTotal(e.unit, e.price, qty, nights, guests) };
    });
  const extrasSum = cartExtras.reduce((s, e) => s + e.total, 0);

  // Группировка платных услуг по категориям
  const groups = new Map<string, Extra[]>();
  for (const e of paid) {
    const cat = e.category ?? 'Услуги';
    groups.set(cat, [...(groups.get(cat) ?? []), e]);
  }

  return (
    <div className="fixed inset-0 z-[58] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-white px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-dark-gray">{propertyName}</p>
            <h2 className="text-lg text-ink">
              {rate ? 'Дополнительные услуги' : `${room.roomTypeName} · выбор тарифа`}
            </h2>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-dark-gray hover:text-ink" aria-label="Закрыть">×</button>
        </div>

        {/* Шаг 1 — тарифы */}
        {!rate ? (
          <div className="space-y-3 px-6 py-5">
            {!isGuest && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-beige px-4 py-2.5">
                <p className="text-sm text-ink">«За регистрацию» — цена с учётом {cashbackPercent}% кэшбэка баллами.</p>
                <Link href="/register" className="shrink-0 rounded-lg bg-ink px-3 py-1.5 text-sm text-white">Регистрация</Link>
              </div>
            )}
            {room.ratePlans.map((rp) => {
              const cashback = Math.round((rp.perNight * cashbackPercent) / 100);
              return (
                <div key={rp.id} className="rounded-xl border border-ink/15 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <button onClick={() => setOpenInfo(openInfo === rp.id ? null : rp.id)} className="flex items-center gap-1.5 text-left">
                        <h3 className="text-base font-medium text-ink">{rp.name}</h3>
                        <span className="text-xs text-dark-gray">Подробнее</span>
                      </button>
                      <ul className="mt-3 space-y-2 text-sm text-dark-gray">
                        <li className="flex gap-2"><Icon d="M9 14l-4-4 4-4M5 10h9a4 4 0 0 1 0 8h-1" /><span>{rp.cancellationPolicy}</span></li>
                        <li className="flex gap-2"><Icon d="M3 7h18v10H3zM3 11h18" /><span>Оплата: картой, по QR-коду (СБП), безналичным расчётом</span></li>
                        {openInfo === rp.id && (
                          <li className="flex gap-2"><Icon d="M12 8v8M8 12h8" /><span>Тариф {rp.refundable ? 'возвратный' : 'невозвратный'}. Чек по 54-ФЗ.</span></li>
                        )}
                      </ul>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-dark-gray">Стоимость за 1 ночь</p>
                      {!isGuest ? (
                        <p className="mt-1 text-sm font-medium text-amber-700">За регистрацию {(rp.perNight - cashback).toLocaleString('ru')} ₽</p>
                      ) : (
                        <p className="mt-1 text-sm text-amber-700">Кэшбэк +{cashback.toLocaleString('ru')} баллов</p>
                      )}
                      <p className="text-2xl text-ink">{rp.perNight.toLocaleString('ru')} ₽</p>
                      <p className="mb-2 text-xs text-dark-gray">до {room.capacity} гост.</p>
                      <Button onClick={() => setRate(rp)}>Выбрать</Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Шаг 2 — доп-услуги */
          <div className="px-6 py-5">
            <button onClick={() => setRate(null)} className="mb-3 text-sm text-dark-gray underline hover:text-ink">‹ Назад к тарифам</button>
            <p className="mb-4 text-sm text-dark-gray">
              Тариф: <span className="text-ink">{rate.name}</span> · {rate.perNight.toLocaleString('ru')} ₽/ночь. Добавьте услуги (необязательно):
            </p>

            {/* Включено в тариф — бесплатно */}
            {included.length > 0 && (
              <div className="mb-5 rounded-xl border border-emerald-600/30 bg-emerald-50/60 p-4">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-emerald-800">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
                  Включено в тариф
                </p>
                <div className="space-y-2">
                  {included.map((e) => (
                    <div key={e.id} className="flex items-center gap-3">
                      {e.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={e.imageUrl} alt={e.name} className="h-12 w-16 rounded-md object-cover" />
                      ) : (
                        <div className="flex h-12 w-16 items-center justify-center rounded-md bg-emerald-100 text-emerald-700"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg></div>
                      )}
                      <div className="flex-1">
                        <p className="text-sm font-medium text-ink">{e.name}</p>
                        {e.description && <p className="text-xs text-dark-gray">{e.description}</p>}
                      </div>
                      <span className="shrink-0 text-sm font-medium text-emerald-700">Бесплатно</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {paid.length === 0 ? (
              <p className="text-sm text-dark-gray">
                {included.length > 0 ? 'Других платных услуг для этого тарифа нет.' : 'Для этой категории и дат доп-услуг нет.'}
              </p>
            ) : (
              <div className="space-y-5">
                {[...groups.entries()].map(([cat, list]) => (
                  <div key={cat}>
                    <p className="mb-2 text-xs uppercase tracking-wide text-dark-gray">{cat}</p>
                    <div className="space-y-2">
                      {list.map((e) => {
                        const on = !!selected[e.id];
                        const qty = e.quantitySelectable ? selected[e.id] ?? 1 : 1;
                        const lineTotal = computeExtraTotal(e.unit, e.price, qty, nights, guests);
                        return (
                          <div key={e.id} className={`flex gap-4 rounded-xl border p-3 ${on ? 'border-ink/40 bg-beige/40' : 'border-ink/10'}`}>
                            {/* Крупная картинка */}
                            <button onClick={() => toggleExtra(e)} className="shrink-0">
                              {e.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={e.imageUrl} alt={e.name} className="h-28 w-40 rounded-lg object-cover" />
                              ) : (
                                <div className="flex h-28 w-40 items-center justify-center rounded-lg bg-beige text-xs text-dark-gray">нет фото</div>
                              )}
                            </button>
                            {/* Название и описание */}
                            <button onClick={() => toggleExtra(e)} className="flex-1 text-left">
                              <p className="text-base font-medium text-ink">{e.name}</p>
                              {e.description && <p className="mt-1 text-sm text-dark-gray">{e.description}</p>}
                              <p className="mt-1 text-xs text-dark-gray">{UNIT_LABEL[e.unit]}</p>
                            </button>
                            {/* Справа: галочка + цена */}
                            <div className="flex w-28 shrink-0 flex-col items-end gap-1.5">
                              <input type="checkbox" checked={on} onChange={() => toggleExtra(e)} className="h-5 w-5 accent-black" />
                              <p className="text-lg text-ink">{e.price.toLocaleString('ru')} ₽</p>
                              {on && e.quantitySelectable && (
                                <div className="flex items-center gap-2">
                                  <button onClick={() => setQty(e, qty - 1)} className="flex h-6 w-6 items-center justify-center rounded-full border border-ink/25">−</button>
                                  <span className="w-4 text-center text-sm">{qty}</span>
                                  <button onClick={() => setQty(e, qty + 1)} className="flex h-6 w-6 items-center justify-center rounded-full border border-ink/25">+</button>
                                </div>
                              )}
                              {on && <p className="text-sm font-medium text-amber-700">+{lineTotal.toLocaleString('ru')} ₽</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="sticky bottom-0 mt-5 flex items-center justify-between gap-3 border-t border-ink/10 bg-white pt-4">
              <span className="text-sm text-dark-gray">
                Номер {rate.totalPrice.toLocaleString('ru')} ₽{extrasSum > 0 ? ` + услуги ${extrasSum.toLocaleString('ru')} ₽` : ''}
              </span>
              <Button
                onClick={() => {
                  onAdd(room, rate.id, cartExtras);
                  onClose();
                }}
              >
                Добавить
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
