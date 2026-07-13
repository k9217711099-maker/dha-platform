'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export interface CartExtra {
  extraId: string;
  name: string;
  unit: string;
  unitPrice: number;
  qty: number;
  total: number; // за один номер, весь период
}

export interface CartItem {
  propertyId: string;
  propertyName: string;
  roomTypeId: string;
  roomTypeName: string;
  ratePlanId: string;
  ratePlanName: string;
  perNight: number;
  totalPrice: number; // за один номер, весь период
  photo: string | null;
  checkIn: string;
  checkOut: string;
  guests: number;
  children: number;
  roomsCount: number;
  extras: CartExtra[];
  extrasTotal: number; // сумма услуг за один номер
}

const itemKey = (i: Pick<CartItem, 'roomTypeId' | 'ratePlanId' | 'checkIn' | 'checkOut'>) =>
  `${i.roomTypeId}|${i.ratePlanId}|${i.checkIn}|${i.checkOut}`;

interface CartState {
  items: CartItem[];
  add: (item: CartItem) => void;
  setRooms: (key: string, n: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  count: number;
  total: number;
  keyOf: (i: Pick<CartItem, 'roomTypeId' | 'ratePlanId' | 'checkIn' | 'checkOut'>) => string;
}

const CartContext = createContext<CartState | null>(null);
const STORAGE = 'dha_cart';

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  // Восстановление из localStorage (с миграцией старых позиций без extras)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (raw) {
        const parsed = JSON.parse(raw) as CartItem[];
        setItems(
          parsed.map((x) => ({
            ...x,
            extras: x.extras ?? [],
            extrasTotal: x.extrasTotal ?? 0,
            roomsCount: x.roomsCount || 1,
          })),
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(items));
    } catch {
      /* ignore */
    }
  }, [items]);

  const add = useCallback((item: CartItem) => {
    setItems((s) => {
      const k = itemKey(item);
      const existing = s.find((x) => itemKey(x) === k);
      if (existing) {
        return s.map((x) => (itemKey(x) === k ? { ...x, roomsCount: x.roomsCount + 1 } : x));
      }
      return [...s, { ...item, roomsCount: item.roomsCount || 1 }];
    });
  }, []);

  const setRooms = useCallback((key: string, n: number) => {
    setItems((s) =>
      s
        .map((x) => (itemKey(x) === key ? { ...x, roomsCount: Math.max(0, n) } : x))
        .filter((x) => x.roomsCount > 0),
    );
  }, []);

  const remove = useCallback((key: string) => {
    setItems((s) => s.filter((x) => itemKey(x) !== key));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const value = useMemo<CartState>(() => {
    const count = items.reduce((s, i) => s + i.roomsCount, 0);
    const total = items.reduce((s, i) => s + (i.totalPrice + i.extrasTotal) * i.roomsCount, 0);
    return { items, add, setRooms, remove, clear, count, total, keyOf: itemKey };
  }, [items, add, setRooms, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart должен использоваться внутри CartProvider');
  return ctx;
}
