'use client';

import { useEffect } from 'react';

interface Props {
  photos: string[];
  index: number;
  title?: string;
  onIndex: (i: number) => void;
  onClose: () => void;
}

/** Полноэкранный просмотр фото с лентой миниатюр внизу. */
export function Lightbox({ photos, index, title, onIndex, onClose }: Props) {
  const prev = () => onIndex((index - 1 + photos.length) % photos.length);
  const next = () => onIndex((index + 1) % photos.length);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [index, photos.length]);

  if (photos.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95" onClick={onClose}>
      <div className="flex items-center justify-between px-5 py-3 text-white/90" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm">{title}</span>
        <span className="text-sm">
          {index + 1} / {photos.length}
          <button onClick={onClose} className="ml-5 text-2xl leading-none hover:text-white" aria-label="Закрыть">×</button>
        </span>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4" onClick={(e) => e.stopPropagation()}>
        <button
          onClick={prev}
          className="absolute left-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20"
          aria-label="Предыдущее фото"
        >
          ‹
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={photos[index]} alt={title ?? 'Фото'} className="max-h-[72vh] max-w-full rounded-lg object-contain" />
        <button
          onClick={next}
          className="absolute right-3 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-2xl text-white hover:bg-white/20"
          aria-label="Следующее фото"
        >
          ›
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto px-5 py-4" onClick={(e) => e.stopPropagation()}>
        {photos.map((p, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={p}
            src={p}
            alt=""
            onClick={() => onIndex(i)}
            className={`h-16 w-24 shrink-0 cursor-pointer rounded-md object-cover transition ${
              i === index ? 'ring-2 ring-white' : 'opacity-60 hover:opacity-100'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
