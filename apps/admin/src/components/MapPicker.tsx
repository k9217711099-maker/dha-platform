'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useId, useRef } from 'react';

// Ключ Яндекс.Карт (публичный клиентский ключ; в проде ограничивается referrer'ом в консоли Яндекса).
const YANDEX_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_KEY ?? 'd001ecc5-985a-4de3-9494-6ca4a829dad7';

let ymapsPromise: Promise<any> | null = null;
function loadYmaps(): Promise<any> {
  const w = window as any;
  if (w.ymaps?.Map) return Promise.resolve(w.ymaps);
  if (ymapsPromise) return ymapsPromise;
  ymapsPromise = new Promise((resolve, reject) => {
    const done = () => (window as any).ymaps.ready(() => resolve((window as any).ymaps));
    if (w.ymaps) { done(); return; }
    const s = document.createElement('script');
    // suggest — модуль подсказок адреса (SuggestView).
    s.src = `https://api-maps.yandex.ru/2.1/?apikey=${YANDEX_KEY}&lang=ru_RU&load=package.full`;
    s.onload = done;
    s.onerror = () => reject(new Error('Не удалось загрузить Яндекс.Карты'));
    document.body.appendChild(s);
  });
  return ymapsPromise;
}

interface MapPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
  /** Текущий адрес (для поля поиска). Если задан onAddressChange — показываем строку поиска с автоподсказками. */
  address?: string;
  /** Колбэк на выбор адреса (из подсказки или клика по карте). */
  onAddressChange?: (address: string) => void;
}

/**
 * Интерактивная Яндекс.Карта с поиском адреса.
 * — Ввод адреса → автоподсказки (SuggestView) → выбор геокодирует и ставит метку.
 * — Клик/перетаскивание метки → координаты + обратное геокодирование заполняет адрес.
 */
export function MapPicker({ lat, lng, onChange, address, onAddressChange }: MapPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<any>(null);
  const pmRef = useRef<any>(null);
  const ymapsRef = useRef<any>(null);
  const inputId = useId();
  const onChangeRef = useRef(onChange);
  const onAddressRef = useRef(onAddressChange);
  onChangeRef.current = onChange;
  onAddressRef.current = onAddressChange;
  const withSearch = typeof onAddressChange === 'function';

  useEffect(() => {
    let cancelled = false;
    const center: [number, number] = [lat ?? 59.9386, lng ?? 30.3141]; // СПб по умолчанию
    void loadYmaps()
      .then((ymaps) => {
        if (cancelled || !ref.current || mapRef.current) return;
        ymapsRef.current = ymaps;
        const map = new ymaps.Map(ref.current, { center, zoom: lat != null && lng != null ? 16 : 11, controls: ['zoomControl', 'geolocationControl'] });
        mapRef.current = map;

        const place = (a: number, b: number) => {
          if (pmRef.current) pmRef.current.geometry.setCoordinates([a, b]);
          else {
            const pm = new ymaps.Placemark([a, b], {}, { draggable: true });
            pm.events.add('dragend', () => {
              const c = pm.geometry.getCoordinates();
              onChangeRef.current(+c[0].toFixed(6), +c[1].toFixed(6));
              reverseGeocode(c[0], c[1]);
            });
            map.geoObjects.add(pm);
            pmRef.current = pm;
          }
        };
        const reverseGeocode = (a: number, b: number) => {
          if (!onAddressRef.current) return;
          ymaps.geocode([a, b], { results: 1 }).then((res: any) => {
            const first = res.geoObjects.get(0);
            if (first && onAddressRef.current) onAddressRef.current(first.getAddressLine());
          }).catch(() => undefined);
        };

        if (lat != null && lng != null) place(lat, lng);
        map.events.add('click', (e: any) => {
          const c = e.get('coords');
          place(c[0], c[1]);
          onChangeRef.current(+c[0].toFixed(6), +c[1].toFixed(6));
          reverseGeocode(c[0], c[1]);
        });

        // Строка поиска с автоподсказками адреса.
        if (withSearch && inputRef.current) {
          const suggest = new ymaps.SuggestView(inputRef.current, { results: 6 });
          const geocodeQuery = (query: string) => {
            if (!query.trim()) return;
            ymaps.geocode(query, { results: 1 }).then((res: any) => {
              const first = res.geoObjects.get(0);
              if (!first) return;
              const c = first.geometry.getCoordinates() as [number, number];
              place(c[0], c[1]);
              map.setCenter(c, 16);
              onChangeRef.current(+c[0].toFixed(6), +c[1].toFixed(6));
              if (onAddressRef.current) onAddressRef.current(first.getAddressLine());
            }).catch(() => undefined);
          };
          suggest.events.add('select', (e: any) => geocodeQuery(e.get('item').value));
          inputRef.current.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); geocodeQuery((ev.target as HTMLInputElement).value); }
          });
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; if (mapRef.current) { mapRef.current.destroy(); mapRef.current = null; pmRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ручной ввод координат → двигаем метку/центр.
  useEffect(() => {
    if (!mapRef.current || lat == null || lng == null) return;
    if (pmRef.current) pmRef.current.geometry.setCoordinates([lat, lng]);
    mapRef.current.setCenter([lat, lng]);
  }, [lat, lng]);

  return (
    <div>
      {withSearch ? (
        <input
          ref={inputRef}
          id={inputId}
          defaultValue={address ?? ''}
          placeholder="Начните вводить адрес — выберите из подсказок"
          className="mb-2 w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm"
          autoComplete="off"
        />
      ) : null}
      <div ref={ref} className="h-64 w-full overflow-hidden rounded-md border border-ink/10" />
    </div>
  );
}
