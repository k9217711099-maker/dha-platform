'use client';

import { useEffect, useRef } from 'react';
import { PROPERTY_TYPE_LABELS, type PropertyType } from '@dha/domain';
import type { PropertySearchResult } from '../lib/api-types';

const API_KEY = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY ?? '';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global {
  interface Window {
    ymaps?: any;
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface Props {
  properties: PropertySearchResult[];
  /** Открыть всплывающее окно категории (как из поиска). */
  onSelectRoom: (propertyId: string, roomTypeId: string) => void;
}

/** Яндекс.Карта: флажки объектов с ценой; в балуне — фото, тип, размер и «Подробнее». */
export function YandexMap({ properties, onSelectRoom }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);

  // Клик по «Подробнее» в балуне → открыть попап категории
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest('[data-dha-room]');
      if (!el) return;
      e.preventDefault();
      onSelectRoom(el.getAttribute('data-dha-prop') ?? '', el.getAttribute('data-dha-room') ?? '');
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [onSelectRoom]);

  useEffect(() => {
    if (!API_KEY || !ref.current) return;
    let cancelled = false;

    function build() {
      if (cancelled || !window.ymaps || !ref.current) return;
      window.ymaps.ready(() => {
        if (cancelled || !ref.current) return;
        if (mapRef.current) {
          mapRef.current.destroy();
          mapRef.current = null;
        }
        const pts = properties.filter((p) => p.latitude != null && p.longitude != null);
        const center = pts.length ? [pts[0]!.latitude, pts[0]!.longitude] : [59.9343, 30.3351];
        const map = new window.ymaps.Map(ref.current, { center, zoom: 12, controls: ['zoomControl'] });
        mapRef.current = map;

        for (const p of pts) {
          const typeLabel = PROPERTY_TYPE_LABELS[p.type as PropertyType] ?? p.type;
          const cats = p.rooms
            .map((r) => {
              const cheapest = r.ratePlans.length ? r.ratePlans.reduce((a, b) => (a.perNight <= b.perNight ? a : b)) : null;
              const photo = r.photos[0]
                ? `<img src="${esc(r.photos[0])}" style="width:72px;height:54px;object-fit:cover;border-radius:6px"/>`
                : '';
              const priceLine = cheapest
                ? `<div style="font-size:13px;margin-top:2px">от ${cheapest.perNight.toLocaleString('ru')} ₽ / ночь</div>`
                : '';
              return `<div style="display:flex;gap:10px;padding:8px 0;border-top:1px solid #eee">
                ${photo}
                <div style="flex:1">
                  <div style="font-size:14px;font-weight:600">${esc(r.roomTypeName)}</div>
                  <div style="font-size:12px;color:#777">${esc(typeLabel)} · до ${r.capacity} гост.${r.areaSqm ? ` · ${r.areaSqm} м²` : ''}</div>
                  ${priceLine}
                  <a href="#" data-dha-prop="${esc(p.propertyId)}" data-dha-room="${esc(r.roomTypeId)}" style="font-size:13px;color:#000;font-weight:600">Подробнее →</a>
                </div>
              </div>`;
            })
            .join('');
          const balloon = `<div style="min-width:240px;max-width:300px;font-family:sans-serif">
            <div style="font-size:15px;margin-bottom:2px">${esc(p.name)}</div>
            <div style="font-size:12px;color:#777">${esc(p.address)}</div>
            ${cats}
          </div>`;
          const mark = new window.ymaps.Placemark(
            [p.latitude, p.longitude],
            {
              iconContent: p.fromPrice > 0 ? `от ${p.fromPrice.toLocaleString('ru')} ₽` : esc(p.name),
              balloonContent: balloon,
            },
            { preset: 'islands#blackStretchyIcon' },
          );
          map.geoObjects.add(mark);
        }
      });
    }

    if (window.ymaps) {
      build();
    } else {
      const id = 'ymaps-script';
      let s = document.getElementById(id) as HTMLScriptElement | null;
      if (!s) {
        s = document.createElement('script');
        s.id = id;
        s.src = `https://api-maps.yandex.ru/2.1/?apikey=${API_KEY}&lang=ru_RU`;
        document.head.appendChild(s);
      }
      s.addEventListener('load', build);
    }

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
    };
  }, [properties]);

  if (!API_KEY) {
    return (
      <div className="flex h-full min-h-[300px] items-center justify-center bg-beige/50 text-center text-sm text-dark-gray">
        Карта появится после добавления ключа Яндекс.Карт<br />
        (NEXT_PUBLIC_YANDEX_MAPS_API_KEY)
      </div>
    );
  }
  return <div ref={ref} className="h-full min-h-[300px] w-full" />;
}
