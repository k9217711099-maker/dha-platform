'use client';

import { useEffect, useState } from 'react';
import { Button } from '@dha/ui';
import { adminApi, fileUrl, type RoomFundCategory } from '../../../lib/api';
import { useEsc } from '../../../lib/use-esc';

/** Быстрый просмотр категории с шахматки: фото, характеристики, описание (иконка «глазик»). */
export function CategoryPreviewPopup({ roomTypeId, onClose }: { roomTypeId: string; onClose: () => void }) {
  useEsc(onClose);
  const [cat, setCat] = useState<RoomFundCategory | null>(null);
  const [error, setError] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    void adminApi.roomFundCategory(roomTypeId).then(setCat).catch(() => setError(true));
  }, [roomTypeId]);

  const photos = cat?.photos ?? [];
  const cover = photos[active] ?? photos[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {error ? (
          <div className="text-sm text-red-600">Не удалось загрузить категорию.</div>
        ) : !cat ? (
          <div className="text-sm text-dark-gray">Загрузка…</div>
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-light text-ink">{cat.name}</h2>
                <p className="text-sm text-dark-gray">
                  {cat.property.name}
                  {cat.typeLabel ? ` · ${cat.typeLabel}` : ''}
                  {cat.shortName ? ` · ${cat.shortName}` : ''}
                </p>
              </div>
              <button type="button" onClick={onClose} className="text-2xl leading-none text-ink/40 hover:text-ink">×</button>
            </div>

            {cover ? (
              <div className="mb-4">
                <img src={fileUrl(cover)} alt={cat.name} className="h-64 w-full rounded-lg object-cover" />
                {photos.length > 1 ? (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {photos.map((p, i) => (
                      <button key={p} type="button" onClick={() => setActive(i)} className={`h-14 w-20 shrink-0 overflow-hidden rounded-md border-2 ${i === active ? 'border-ink' : 'border-transparent'}`}>
                        <img src={fileUrl(p)} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mb-4 flex h-40 items-center justify-center rounded-lg bg-ink/5 text-sm text-dark-gray">Фотографий нет</div>
            )}

            <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Fact label="Осн. места" value={cat.mainPlaces ?? cat.capacity} />
              <Fact label="Доп. места" value={cat.extraPlaces || '—'} />
              <Fact label="Комнат" value={cat.roomsInUnit ?? '—'} />
              <Fact label="Площадь" value={area(cat)} />
              <Fact label="Кровать" value={cat.bedPreference ?? cat.bedType ?? '—'} />
              <Fact label="Вид" value={cat.viewPreference ?? '—'} />
              <Fact label="Номеров" value={cat._count.rooms} />
            </div>

            {cat.priorityAmenities.length ? (
              <div className="mb-4">
                <p className="mb-1 text-xs uppercase tracking-wide text-dark-gray">Ключевое оснащение</p>
                <div className="flex flex-wrap gap-1.5">
                  {cat.priorityAmenities.map((a) => (
                    <span key={a} className="rounded-full bg-ink/5 px-2.5 py-1 text-xs text-ink">{a}</span>
                  ))}
                </div>
              </div>
            ) : null}

            {cat.description ? (
              <div className="mb-4">
                <p className="mb-1 text-xs uppercase tracking-wide text-dark-gray">Описание</p>
                <p className="whitespace-pre-line text-sm text-ink/80">{cat.description}</p>
              </div>
            ) : null}

            {cat.address ? <p className="text-xs text-dark-gray">📍 {cat.address}</p> : null}

            <div className="mt-5 flex justify-end gap-2">
              <a href={`/settings/room-fund/category/${cat.id}`} className="inline-flex">
                <Button variant="secondary">Открыть категорию</Button>
              </a>
              <Button onClick={onClose}>Закрыть</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-xs text-dark-gray">{label}</div>
      <div className="text-ink">{value}</div>
    </div>
  );
}

function area(c: RoomFundCategory): string {
  if (c.areaSqm == null) return '—';
  if (c.areaMode === 'range' && c.areaSqmTo != null) return `${c.areaSqm}–${c.areaSqmTo} м²`;
  return `${c.areaSqm} м²`;
}
