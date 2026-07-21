'use client';

import { useState } from 'react';
import { adminApi, type AdminPassport } from '../../../lib/api';

/**
 * Панель паспортных данных гостя (данные + сканы) — карточка брони и карточка гостя.
 * Данные шифруются; просмотр логируется (152-ФЗ), поэтому грузим ТОЛЬКО по кнопке.
 * Право `checkins` (эндпоинты admin/checkin/*). Передать bookingId ИЛИ guestId.
 */

const CHECK: Record<string, { text: string; cls: string }> = {
  VALID: { text: 'действителен', cls: 'bg-emerald-100 text-emerald-800' },
  INVALID: { text: 'недействителен', cls: 'bg-red-100 text-red-700' },
  MANUAL: { text: 'ручная проверка', cls: 'bg-amber-100 text-amber-800' },
};

export function PassportPanel({ bookingId, guestId }: { bookingId?: string; guestId?: string }) {
  const [data, setData] = useState<AdminPassport | null>(null);
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [scan, setScan] = useState<string | null>(null);
  const [ocr, setOcr] = useState<{ reachable: boolean; note: string; provider: string } | null>(null);

  const show = () => {
    setBusy(true);
    setErr('');
    const p = bookingId ? adminApi.pmsPassportByBooking(bookingId) : adminApi.pmsPassportByGuest(guestId!);
    p.then((d) => {
      setData(d);
      setOpened(true);
    })
      .catch((e) => setErr(e instanceof Error ? e.message : 'Ошибка'))
      .finally(() => setBusy(false));
    void adminApi.pmsPassportOcrStatus().then(setOcr).catch(() => undefined);
  };

  const viewScan = (docId: string) => {
    setBusy(true);
    adminApi
      .pmsPassportDoc(docId)
      .then((r) => setScan(r.dataUrl))
      .catch(() => setErr('Не удалось открыть скан'))
      .finally(() => setBusy(false));
  };

  if (!opened) {
    return (
      <div className="rounded-xl border border-ink/10 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-dark-gray">Паспорт гостя</p>
        <p className="mt-1 text-xs text-dark-gray">Данные и сканы. Просмотр логируется (152-ФЗ).</p>
        <button
          type="button"
          onClick={show}
          disabled={busy}
          className="mt-2 rounded-md border border-ink/20 px-3 py-1.5 text-xs text-ink hover:bg-ink/5 disabled:opacity-50"
        >
          {busy ? 'Загрузка…' : '🔒 Показать паспортные данные'}
        </button>
        {err ? <p className="mt-2 text-xs text-rose-600">{err}</p> : null}
      </div>
    );
  }

  const hasData = data && (data.series || data.number || data.documents.length > 0);
  return (
    <div className="rounded-xl border border-ink/10 bg-white p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-dark-gray">Паспорт гостя</p>
        {data?.checkStatus ? (
          <span className={`rounded-full px-2 py-0.5 text-xs ${CHECK[data.checkStatus]?.cls}`} title={data.checkNote ?? undefined}>
            Проверка: {CHECK[data.checkStatus]?.text}
          </span>
        ) : null}
      </div>

      {!hasData ? (
        <p className="text-sm text-dark-gray">Гость ещё не заполнял паспортные данные.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-dark-gray">Серия:</span> <span className="text-ink">{data!.series ?? '—'}</span>
            </div>
            <div>
              <span className="text-dark-gray">Номер:</span> <span className="text-ink">{data!.number ?? '—'}</span>
            </div>
          </div>
          {data!.documents.length > 0 ? (
            <div className="mt-2">
              <p className="mb-1 text-xs text-dark-gray">Сканы ({data!.documents.length}):</p>
              <div className="flex flex-wrap gap-2">
                {data!.documents.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    disabled={busy}
                    onClick={() => viewScan(d.id)}
                    className="rounded-md border border-ink/20 px-2 py-1 text-xs text-ink hover:bg-ink/5 disabled:opacity-50"
                  >
                    🖼 Скан от {new Date(d.createdAt).toLocaleDateString('ru-RU')}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-dark-gray">Скан не загружен.</p>
          )}
        </>
      )}

      {ocr ? (
        <p className={`mt-2 text-[11px] ${ocr.reachable ? 'text-emerald-600' : 'text-dark-gray'}`}>
          Распознавание паспорта:{' '}
          {ocr.reachable ? 'работает (OCR-сайдкар доступен)' : ocr.provider === 'http' ? 'сайдкар недоступен' : 'демо-режим (mock) — распознавания нет'}
        </p>
      ) : null}
      {err ? <p className="mt-2 text-xs text-rose-600">{err}</p> : null}

      {scan ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={() => setScan(null)}>
          <div className="max-h-[92vh] max-w-3xl overflow-auto" onClick={(e) => e.stopPropagation()}>
            {scan.startsWith('data:application/pdf') ? (
              <iframe title="Скан паспорта" src={scan} className="h-[85vh] w-[80vw] bg-white" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={scan} alt="Скан паспорта" className="max-h-[88vh] w-auto rounded-lg" />
            )}
            <div className="mt-2 text-center">
              <button type="button" onClick={() => setScan(null)} className="rounded-md bg-white px-3 py-1 text-xs text-ink">
                Закрыть
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
