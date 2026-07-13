'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCart } from '../lib/cart-context';

function rooms(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'номер';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'номера';
  return 'номеров';
}

/** Плавающая панель «подбор номеров» с раскрывающимся составом и переходом к оплате. */
export function CartBar() {
  const cart = useCart();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (cart.count === 0 || pathname === '/checkout') return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40">
      {/* Раскрытый состав */}
      {open && (
        <div className="mx-auto max-w-6xl px-4">
          <div className="mb-2 max-h-[50vh] overflow-y-auto rounded-2xl border border-ink/10 bg-white p-3 shadow-2xl">
            {cart.items.map((i) => {
              const key = cart.keyOf(i);
              const line = (i.totalPrice + i.extrasTotal) * i.roomsCount;
              return (
                <div key={key} className="flex items-center gap-4 border-t border-ink/10 py-3 first:border-0">
                  <div className="h-16 w-24 shrink-0 overflow-hidden rounded-lg bg-beige">
                    {i.photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={i.photo} alt={i.roomTypeName} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-base font-medium text-ink">{i.roomTypeName}</p>
                    <p className="text-sm text-dark-gray">{i.propertyName}</p>
                    <p className="mt-0.5 text-sm text-dark-gray">
                      {i.checkIn} — {i.checkOut} · {i.ratePlanName}
                    </p>
                    {i.extras.length > 0 && (
                      <p className="mt-0.5 text-sm text-dark-gray">
                        Услуги: {i.extras.map((e) => `${e.name}${e.qty > 1 ? `×${e.qty}` : ''}`).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => cart.setRooms(key, i.roomsCount - 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/25 hover:bg-beige">−</button>
                    <span className="w-5 text-center text-base">{i.roomsCount}</span>
                    <button onClick={() => cart.setRooms(key, i.roomsCount + 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-ink/25 hover:bg-beige">+</button>
                  </div>
                  <div className="w-28 text-right">
                    <p className="text-base font-medium text-ink">{line.toLocaleString('ru')} ₽</p>
                    <button onClick={() => cart.remove(key)} className="text-sm text-dark-gray underline hover:text-red-700">убрать</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Сама панель */}
      <div className="border-t border-ink/10 bg-white/95 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 text-left text-sm text-ink">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={open ? 'rotate-180 transition' : 'transition'}>
              <path d="M6 9l6 6 6-6" />
            </svg>
            В подборе <b>{cart.count}</b> {rooms(cart.count)} · <b>{cart.total.toLocaleString('ru')} ₽</b>
            <span className="text-xs text-dark-gray underline">{open ? 'скрыть состав' : 'показать состав'}</span>
          </button>
          <div className="flex items-center gap-3">
            <button onClick={cart.clear} className="text-xs text-dark-gray underline hover:text-ink">очистить</button>
            <Link href="/checkout" className="rounded-lg bg-ink px-5 py-2 text-sm font-medium text-white hover:opacity-90">Перейти к оплате</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
