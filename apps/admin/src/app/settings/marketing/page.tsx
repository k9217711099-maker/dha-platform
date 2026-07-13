'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card } from '@dha/ui';
import { adminApi, type MarketingKind, type MarketingOption } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

const fieldCls = 'w-full rounded-md border border-ink/20 bg-white px-3 py-2 text-sm';

export default function MarketingPage() {
  const ready = useRequireAdmin();
  const [items, setItems] = useState<MarketingOption[]>([]);
  const load = () => adminApi.marketingOptions().then(setItems).catch(() => setItems([]));
  useEffect(() => { if (ready) void load(); }, [ready]);

  const byKind = useMemo(() => {
    const m = new Map<MarketingKind, MarketingOption[]>();
    for (const o of items) { const a = m.get(o.kind) ?? []; a.push(o); m.set(o.kind, a); }
    return m;
  }, [items]);

  if (!ready) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-8 py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Маркетинг</h1>
      <p className="mb-6 text-sm text-dark-gray">Настраиваемые словари для броней и промокодов: способ бронирования, откуда узнали, обоснование скидки, причины скидки и отмены. Значения подставляются выпадающими списками при создании брони и промокода.</p>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <DictBlock title="Способ бронирования" kind="BOOKING_METHOD" items={byKind.get('BOOKING_METHOD') ?? []} onChanged={load} />
          <DictBlock title="Откуда Вы о нас узнали?" kind="REFERRAL_SOURCE" items={byKind.get('REFERRAL_SOURCE') ?? []} onChanged={load} />
          <DictBlock title="Обоснование скидки" kind="DISCOUNT_REASON" items={byKind.get('DISCOUNT_REASON') ?? []} onChanged={load} />
        </div>
        <DictBlock title="Причины скидки" kind="DISCOUNT_CAUSE" items={byKind.get('DISCOUNT_CAUSE') ?? []} onChanged={load} />
        <DictBlock title="Причины отмены" kind="CANCEL_REASON" items={byKind.get('CANCEL_REASON') ?? []} onChanged={load} />
      </div>
    </main>
  );
}

function DictBlock({ title, kind, items, onChanged }: { title: string; kind: MarketingKind; items: MarketingOption[]; onChanged: () => void }) {
  const [newLabel, setNewLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const add = () => {
    const l = newLabel.trim();
    if (!l || busy) return;
    setBusy(true);
    void adminApi.createMarketingOption({ kind, label: l }).then(() => { setNewLabel(''); onChanged(); }).finally(() => setBusy(false));
  };
  const saveLabel = (o: MarketingOption, val: string) => {
    const l = val.trim();
    if (!l || l === o.label) return;
    void adminApi.updateMarketingOption(o.id, { label: l }).catch(() => onChanged());
  };
  const del = (o: MarketingOption) => void adminApi.deleteMarketingOption(o.id).then(onChanged).catch(() => undefined);

  return (
    <Card>
      <p className="mb-3 font-medium text-ink">{title} <span className="text-xs font-normal text-ink/40">· {items.length}</span></p>
      <div className="space-y-2">
        {items.map((o) => (
          <div key={o.id} className="flex items-center gap-2">
            <input defaultValue={o.label} onBlur={(e) => saveLabel(o, e.target.value)} className={`${fieldCls} flex-1`} />
            <button type="button" onClick={() => del(o)} title="Удалить" className="shrink-0 rounded p-1.5 text-ink/40 hover:bg-red-50 hover:text-red-600">🗑</button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="Добавить ещё пункт…" className={`${fieldCls} flex-1 border-dashed`} />
          <button type="button" onClick={add} disabled={!newLabel.trim() || busy} className="shrink-0 rounded-md border border-ink/20 px-3 py-2 text-sm text-ink hover:bg-ink/5 disabled:opacity-40">＋</button>
        </div>
      </div>
    </Card>
  );
}
