'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { adminApi, fileUrl, type BookingPaymentInfo, type LegalEntity, type PmsBooking } from '../../../../lib/api';
import { useRequireAdmin } from '../../../../lib/use-admin';

const money = (n: number) => `${Math.round(n).toLocaleString('ru-RU')} ₽`;
const guestName = (b: PmsBooking) => `${b.guest?.lastName ?? ''} ${b.guest?.firstName ?? ''}`.trim() || 'Гость';

/** Печатная форма счёта на оплату (Печать → Сохранить в PDF). */
export default function InvoicePage() {
  return <Suspense fallback={<main className="px-8 py-12 text-dark-gray">Загрузка…</main>}><InvoiceInner /></Suspense>;
}

function InvoiceInner() {
  const ready = useRequireAdmin();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const leId = search.get('le');
  const [b, setB] = useState<PmsBooking | null>(null);
  const [le, setLe] = useState<LegalEntity | null>(null);
  const [pay, setPay] = useState<BookingPaymentInfo | null>(null);

  useEffect(() => {
    if (!ready) return;
    void adminApi.pmsBooking(params.id).then(setB).catch(() => undefined);
    void adminApi.pmsBookingPaymentInfo(params.id).then(setPay).catch(() => undefined);
    void adminApi.financeLegalEntities().then((list) => setLe(list.find((x) => x.id === leId) ?? list.find((x) => x.isDefault) ?? list[0] ?? null)).catch(() => undefined);
  }, [ready, params.id, leId]);

  if (!ready || !b) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  const surcharges = b.priceBreakdown?.surcharges ?? [];
  const total = b.totalPrice + b.extrasTotal;
  const no = b.bookingNumber ?? b.id.slice(0, 8);

  return (
    <main className="mx-auto max-w-[210mm] bg-white p-10 text-ink print:p-0">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <a href="#" onClick={(e) => { e.preventDefault(); window.close(); }} className="text-sm text-dark-gray hover:underline">← Закрыть</a>
        <button type="button" onClick={() => window.print()} className="rounded-md bg-ink px-4 py-2 text-sm text-beige">🖨 Печать / Сохранить в PDF</button>
      </div>

      <div className="border border-ink/15 p-8">
        <h1 className="mb-1 text-2xl font-light">Счёт на оплату № {no}</h1>
        <p className="mb-6 text-sm text-dark-gray">от {new Date().toLocaleDateString('ru-RU')}</p>

        <div className="mb-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-dark-gray">Поставщик</p>
            {le ? (
              <>
                <p className="font-medium">{le.legalName || le.name}</p>
                {le.inn ? <p className="text-dark-gray">ИНН {le.inn}{le.kpp ? ` · КПП ${le.kpp}` : ''}</p> : null}
                {le.legalAddress ? <p className="text-dark-gray">{le.legalAddress}</p> : null}
                {le.bankName ? <p className="text-dark-gray">{le.bankName}</p> : null}
                {le.bankAccount ? <p className="text-dark-gray">р/с {le.bankAccount}{le.bik ? ` · БИК ${le.bik}` : ''}</p> : null}
                {le.corrAccount ? <p className="text-dark-gray">к/с {le.corrAccount}</p> : null}
              </>
            ) : <p className="text-dark-gray">Реквизиты не выбраны</p>}
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-dark-gray">Плательщик</p>
            <p className="font-medium">{guestName(b)}</p>
            {b.guest?.phone ? <p className="text-dark-gray">{b.guest.phone}</p> : null}
            {b.guest?.email ? <p className="text-dark-gray">{b.guest.email}</p> : null}
            <p className="mt-2 text-dark-gray">{b.property.name} · {b.roomType.name}</p>
            <p className="text-dark-gray">{new Date(b.checkIn).toLocaleDateString('ru-RU')} — {new Date(b.checkOut).toLocaleDateString('ru-RU')} · {b.nights} ноч.</p>
          </div>
        </div>

        <table className="mb-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-ink/20 text-left"><th className="py-2 font-medium">Наименование</th><th className="w-16 py-2 text-center font-medium">Кол-во</th><th className="w-28 py-2 text-right font-medium">Цена</th><th className="w-28 py-2 text-right font-medium">Сумма</th></tr>
          </thead>
          <tbody>
            <tr className="border-b border-ink/10"><td className="py-2">Проживание · {b.roomType.name} ({b.nights} ноч.)</td><td className="py-2 text-center">1</td><td className="py-2 text-right">{money(b.totalPrice - surcharges.reduce((s, x) => s + x.amount, 0))}</td><td className="py-2 text-right">{money(b.totalPrice - surcharges.reduce((s, x) => s + x.amount, 0))}</td></tr>
            {surcharges.map((sc, i) => <tr key={`sc${i}`} className="border-b border-ink/10"><td className="py-2">{sc.type === 'early' ? 'Ранний заезд' : 'Поздний выезд'} ({sc.percent}%)</td><td className="py-2 text-center">1</td><td className="py-2 text-right">{money(sc.amount)}</td><td className="py-2 text-right">{money(sc.amount)}</td></tr>)}
            {(b.extras ?? []).map((e) => <tr key={e.id} className="border-b border-ink/10"><td className="py-2">{e.name}</td><td className="py-2 text-center">{e.qty}</td><td className="py-2 text-right">{money(e.unitPrice)}</td><td className="py-2 text-right">{money(e.total)}</td></tr>)}
          </tbody>
          <tfoot>
            <tr><td colSpan={3} className="py-3 text-right font-medium">Итого к оплате:</td><td className="py-3 text-right text-lg font-medium">{money(total)}</td></tr>
            {pay && pay.paid > 0 ? <tr><td colSpan={3} className="pb-1 text-right text-dark-gray">Оплачено:</td><td className="pb-1 text-right text-dark-gray">{money(pay.paid)}</td></tr> : null}
            {pay && pay.remaining !== total ? <tr><td colSpan={3} className="text-right font-medium">Остаток:</td><td className="text-right font-medium">{money(pay.remaining)}</td></tr> : null}
          </tfoot>
        </table>

        <div className="mt-10 flex items-end justify-between text-sm">
          <div>
            <p className="mb-6 text-dark-gray">Руководитель {le?.director ? `— ${le.director}` : ''}</p>
            <p className="border-t border-ink/30 pt-1 text-xs text-dark-gray">подпись</p>
          </div>
          <div className="flex items-end gap-6">
            {le?.signatureUrl ? <img src={fileUrl(le.signatureUrl)} alt="Подпись" className="h-16 object-contain" /> : null}
            {le?.stampUrl ? <img src={fileUrl(le.stampUrl)} alt="Печать" className="h-24 object-contain" /> : null}
          </div>
        </div>
      </div>
    </main>
  );
}
