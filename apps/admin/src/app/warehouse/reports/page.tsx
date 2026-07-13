'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card } from '@dha/ui';
import { adminApi, type WhMeta } from '../../../lib/api';
import { useRequireAdmin } from '../../../lib/use-admin';

type Row = Record<string, unknown>;
interface Column {
  key: string;
  label: string;
  align?: 'right';
  money?: boolean;
  date?: boolean;
  map?: 'docType' | 'reason' | 'status';
}
interface ReportDef {
  key: string;
  label: string;
  filters: ('period' | 'groupBy' | 'days')[];
  columns: Column[];
  fetch: (f: { from: string; to: string; groupBy: string; days: number }) => Promise<Row[]>;
}

const STATUS: Record<string, string> = {
  DRAFT: 'Черновик', SUBMITTED: 'Отправлена', APPROVED: 'Согласована', REJECTED: 'Отклонена', IN_PROGRESS: 'В работе', FULFILLED: 'Выполнена', CANCELLED: 'Отменена',
};

const REPORTS: ReportDef[] = [
  {
    key: 'stock-value',
    label: 'Стоимость запасов по складам (§6.7.12)',
    filters: [],
    columns: [
      { key: 'name', label: 'Склад' },
      { key: 'positions', label: 'Позиций', align: 'right' },
      { key: 'value', label: 'Стоимость', align: 'right', money: true },
    ],
    fetch: () => adminApi.whReportStockValue(),
  },
  {
    key: 'consumption',
    label: 'Расход по адресам / категориям / номенклатуре (§6.7.3-5)',
    filters: ['period', 'groupBy'],
    columns: [
      { key: 'label', label: 'Группа' },
      { key: 'quantity', label: 'Кол-во', align: 'right' },
      { key: 'amount', label: 'Сумма', align: 'right', money: true },
    ],
    fetch: (f) => adminApi.whReportConsumption(f.groupBy, f.from, f.to),
  },
  {
    key: 'movements',
    label: 'Движение товара за период (§6.7.2)',
    filters: ['period'],
    columns: [
      { key: 'date', label: 'Дата', date: true },
      { key: 'documentType', label: 'Документ', map: 'docType' },
      { key: 'itemName', label: 'Позиция' },
      { key: 'quantityIn', label: 'Приход', align: 'right' },
      { key: 'quantityOut', label: 'Расход', align: 'right' },
      { key: 'amount', label: 'Сумма', align: 'right', money: true },
    ],
    fetch: (f) => adminApi.whReportMovements(f.from, f.to),
  },
  {
    key: 'losses',
    label: 'Потери и списания по причинам (§6.7.10)',
    filters: ['period'],
    columns: [
      { key: 'reason', label: 'Причина', map: 'reason' },
      { key: 'count', label: 'Документов', align: 'right' },
      { key: 'amount', label: 'Сумма', align: 'right', money: true },
    ],
    fetch: (f) => adminApi.whReportLosses(f.from, f.to),
  },
  {
    key: 'low-stock',
    label: 'Товары ниже минимума (§6.7.6)',
    filters: [],
    columns: [
      { key: 'name', label: 'Позиция' },
      { key: 'quantity', label: 'Остаток', align: 'right' },
      { key: 'minStock', label: 'Минимум', align: 'right' },
      { key: 'unit', label: 'Ед.' },
    ],
    fetch: () => adminApi.whReportLowStock(),
  },
  {
    key: 'expiry',
    label: 'Истекающий срок и просроченные (§6.7.7-8)',
    filters: ['days'],
    columns: [
      { key: 'itemName', label: 'Позиция' },
      { key: 'warehouseName', label: 'Склад' },
      { key: 'expiryDate', label: 'Срок', date: true },
      { key: 'daysLeft', label: 'Дней', align: 'right' },
      { key: 'quantity', label: 'Кол-во', align: 'right' },
    ],
    fetch: (f) => adminApi.whReportExpiry(f.days),
  },
  {
    key: 'requests',
    label: 'Заявки и скорость обработки (§6.7.13)',
    filters: [],
    columns: [
      { key: 'number', label: 'Заявка' },
      { key: 'status', label: 'Статус', map: 'status' },
      { key: 'createdAt', label: 'Создана', date: true },
      { key: 'processingHours', label: 'Часов до согл.', align: 'right' },
    ],
    fetch: () => adminApi.whReportRequests(),
  },
  {
    key: 'inventory-diffs',
    label: 'Инвентаризационные расхождения (§6.7.9)',
    filters: [],
    columns: [
      { key: 'inventory', label: 'Инвент.' },
      { key: 'itemName', label: 'Позиция' },
      { key: 'book', label: 'Учёт', align: 'right' },
      { key: 'fact', label: 'Факт', align: 'right' },
      { key: 'deviation', label: 'Откл.', align: 'right' },
      { key: 'deviationMoney', label: 'Сумма', align: 'right', money: true },
    ],
    fetch: () => adminApi.whReportInventoryDiffs(),
  },
];

const isoDaysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

export default function WarehouseReportsPage() {
  const ready = useRequireAdmin();
  const [meta, setMeta] = useState<WhMeta | null>(null);
  const [reportKey, setReportKey] = useState('stock-value');
  const [from, setFrom] = useState(isoDaysAgo(30));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [groupBy, setGroupBy] = useState('address');
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const report = useMemo(() => REPORTS.find((r) => r.key === reportKey)!, [reportKey]);

  useEffect(() => {
    if (ready) adminApi.whMeta().then(setMeta).catch(() => undefined);
  }, [ready]);
  useEffect(() => {
    setRows(null);
  }, [reportKey]);

  const labelFor = (col: Column, v: unknown): string => {
    if (v == null) return '—';
    if (col.map === 'docType') return meta?.docTypes.find((o) => o.value === v)?.label ?? String(v);
    if (col.map === 'reason') return meta?.writeOffReasons.find((o) => o.value === v)?.label ?? String(v);
    if (col.map === 'status') return STATUS[String(v)] ?? String(v);
    if (col.money) return `${Number(v).toLocaleString('ru')} ₽`;
    if (col.date) return new Date(String(v)).toLocaleDateString('ru');
    if (typeof v === 'number') return v.toLocaleString('ru');
    return String(v);
  };

  async function run() {
    setError(null);
    setBusy(true);
    try {
      setRows(await report.fetch({ from, to, groupBy, days }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  function exportQs(): string {
    const p = new URLSearchParams();
    if (report.filters.includes('period')) {
      p.set('from', from);
      p.set('to', to);
    }
    if (report.filters.includes('groupBy')) p.set('groupBy', groupBy);
    if (report.filters.includes('days')) p.set('days', String(days));
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  if (!ready) return <main className="px-6 py-10 text-dark-gray">Загрузка…</main>;

  return (
    <main className="px-4 py-6 sm:px-8 sm:py-8">
      <h1 className="mb-1 text-3xl font-light text-ink">Склад · Отчёты</h1>
      <p className="mb-5 text-sm text-dark-gray">Отчёты по остаткам, движению, расходу, срокам и инвентаризациям (§6.7).</p>
      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

      <Card className="mb-6 space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm text-dark-gray">Отчёт</span>
          <select value={reportKey} onChange={(e) => setReportKey(e.target.value)} className="w-full rounded-md border border-ink/20 bg-white px-3 py-2.5 text-sm sm:max-w-xl">
            {REPORTS.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-3">
          {report.filters.includes('period') && (
            <>
              <label className="block">
                <span className="mb-1 block text-xs text-dark-gray">С</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-ink/20 px-2 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-dark-gray">По</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-ink/20 px-2 py-2 text-sm" />
              </label>
            </>
          )}
          {report.filters.includes('groupBy') && (
            <label className="block">
              <span className="mb-1 block text-xs text-dark-gray">Группировка</span>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="rounded-md border border-ink/20 bg-white px-3 py-2 text-sm">
                <option value="address">По адресам</option>
                <option value="category">По категориям</option>
                <option value="item">По номенклатуре</option>
              </select>
            </label>
          )}
          {report.filters.includes('days') && (
            <label className="block">
              <span className="mb-1 block text-xs text-dark-gray">Горизонт, дней</span>
              <input type="number" min={0} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-28 rounded-md border border-ink/20 px-2 py-2 text-sm" />
            </label>
          )}
          <Button onClick={() => void run()} disabled={busy}>
            Сформировать
          </Button>
          <Button variant="secondary" onClick={() => void adminApi.whExportReport(report.key, exportQs())}>
            Экспорт в Excel
          </Button>
        </div>
      </Card>

      {rows && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink/10 text-left text-dark-gray">
                {report.columns.map((c) => (
                  <th key={c.key} className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : ''}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={report.columns.length} className="px-4 py-6 text-center text-dark-gray">
                    Нет данных.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr key={i} className="border-b border-ink/5">
                    {report.columns.map((c) => (
                      <td key={c.key} className={`px-4 py-2.5 ${c.align === 'right' ? 'text-right' : ''} text-ink`}>
                        {labelFor(c, r[c.key])}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Card>
      )}
    </main>
  );
}
