'use client';

import { useState } from 'react';

/**
 * Демо-страница: 3 варианта дизайна админки на примере одной страницы (Дашборд).
 * Все на Manrope + светлый фон; левая панель НЕ чёрная. Только для сравнения —
 * это статичный макет, реальные экраны перекрашиваются через токены.
 */

type VariantId = 'A' | 'B' | 'C';

const VARIANTS: { id: VariantId; name: string; note: string }[] = [
  { id: 'A', name: 'A · Светлый минимал', note: 'Белая панель, индиго-акценты, максимально спокойно' },
  { id: 'B', name: 'B · Мягкий индиго', note: 'Панель в индиго-тоне, активный пункт залит цветом' },
  { id: 'C', name: 'C · Цветные карточки', note: 'Белая панель + цветные KPI и pill-навигация' },
];

// ── иконки (inline SVG, без эмодзи) ──
const Icon = ({ d, className = 'h-[18px] w-[18px]' }: { d: string; className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className}><path d={d} /></svg>
);
const ICONS = {
  dash: 'M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-5H4v5Z',
  grid: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
  tag: 'M3 12l9-9 9 9-9 9-9-9Zm6-3h.01',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  wallet: 'M3 7h18v12H3V7Zm0 0l2-3h11l2 3M16 13h2',
  box: 'M21 8l-9-5-9 5 9 5 9-5Zm0 0v8l-9 5-9-5V8',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7-3a7 7 0 0 0-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 2h-4l-.3 2.6a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L5 11a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7 7 0 0 0 1.7-1l2.4 1 2-3.4L18.9 13a7 7 0 0 0 .1-1Z',
  search: 'M21 21l-4.3-4.3M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z',
  bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
  plus: 'M12 5v14M5 12h14',
};

const NAV = [
  { key: 'dash', label: 'Дашборд', icon: ICONS.dash, active: true },
  { key: 'grid', label: 'Шахматка', icon: ICONS.grid },
  { key: 'tag', label: 'Тарифы', icon: ICONS.tag },
  { key: 'users', label: 'Гости', icon: ICONS.users },
  { key: 'wallet', label: 'Финансы', icon: ICONS.wallet },
  { key: 'box', label: 'Склад', icon: ICONS.box },
  { key: 'gear', label: 'Настройки', icon: ICONS.gear },
];

const KPIS = [
  { label: 'Загрузка сегодня', value: '87%', delta: '+4%', tone: 'indigo' },
  { label: 'ADR', value: '8 500 ₽', delta: '+2.1%', tone: 'emerald' },
  { label: 'Заезды сегодня', value: '12', delta: '3 ждут', tone: 'sky' },
  { label: 'Задолженность', value: '145 000 ₽', delta: '6 броней', tone: 'amber' },
] as const;

const STATUS: Record<string, { label: string; dot: string; chip: string }> = {
  confirmed: { label: 'Проверено', dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  checkedin: { label: 'Заселён', dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
  pending: { label: 'Новое', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  out: { label: 'Выехал', dot: 'bg-slate-400', chip: 'bg-slate-100 text-slate-600 ring-slate-500/20' },
  cancelled: { label: 'Отменён', dot: 'bg-rose-500', chip: 'bg-rose-50 text-rose-700 ring-rose-600/20' },
};

const ROWS = [
  { guest: 'Розов Сергей', dates: '07–10 июл', cat: 'Апарт. 1-спальный', st: 'checkedin', sum: '30 000 ₽' },
  { guest: 'Иванова Анна', dates: '08–12 июл', cat: 'Студия', st: 'confirmed', sum: '18 500 ₽' },
  { guest: 'Петров Кирилл', dates: '09–11 июл', cat: 'Апарт. 2-спальный', st: 'pending', sum: '24 000 ₽' },
  { guest: 'Смирнова О.', dates: '05–07 июл', cat: 'Студия', st: 'out', sum: '16 000 ₽' },
  { guest: 'Козлов Д.', dates: '10–14 июл', cat: 'Апарт. 1-спальный', st: 'cancelled', sum: '0 ₽' },
];

const toneMap: Record<string, { text: string; bg: string; bar: string }> = {
  indigo: { text: 'text-indigo-600', bg: 'bg-indigo-50', bar: 'bg-indigo-500' },
  emerald: { text: 'text-emerald-600', bg: 'bg-emerald-50', bar: 'bg-emerald-500' },
  sky: { text: 'text-sky-600', bg: 'bg-sky-50', bar: 'bg-sky-500' },
  amber: { text: 'text-amber-600', bg: 'bg-amber-50', bar: 'bg-amber-500' },
};

export default function DesignPreview() {
  const [v, setV] = useState<VariantId>('A');
  return (
    <div style={{ fontFamily: "'Manrope', system-ui, sans-serif" }} className="min-h-screen bg-[#F6F7FB] text-[#1E1B4B]">
      {/* переключатель вариантов */}
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 border-b border-black/5 bg-white/80 px-6 py-3 backdrop-blur">
        <span className="mr-2 text-sm font-semibold">Дизайн админки — 3 варианта:</span>
        {VARIANTS.map((x) => (
          <button key={x.id} onClick={() => setV(x.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${v === x.id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-black/10 hover:bg-slate-50'}`}>
            {x.name}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">{VARIANTS.find((x) => x.id === v)!.note}</span>
      </div>

      <DemoApp variant={v} />
    </div>
  );
}

function DemoApp({ variant }: { variant: VariantId }) {
  // конфиг стиля по варианту
  const cfg = {
    A: {
      aside: 'bg-white border-r border-black/[0.06]',
      brand: 'text-[#1E1B4B]',
      itemBase: 'text-slate-500 hover:bg-slate-50 hover:text-[#1E1B4B]',
      itemActive: 'bg-indigo-50 text-indigo-700 font-semibold',
      itemActiveBar: true,
      pill: false,
      cardAccent: false,
    },
    B: {
      aside: 'bg-indigo-50/70 border-r border-indigo-100',
      brand: 'text-indigo-900',
      itemBase: 'text-indigo-900/60 hover:bg-white hover:text-indigo-900',
      itemActive: 'bg-indigo-600 text-white font-semibold shadow-sm',
      itemActiveBar: false,
      pill: true,
      cardAccent: false,
    },
    C: {
      aside: 'bg-white border-r border-black/[0.06]',
      brand: 'text-[#1E1B4B]',
      itemBase: 'text-slate-500 hover:bg-slate-50 hover:text-[#1E1B4B]',
      itemActive: 'bg-[#1E1B4B] text-white font-semibold',
      itemActiveBar: false,
      pill: true,
      cardAccent: true,
    },
  }[variant];

  return (
    <div className="flex">
      {/* Сайдбар */}
      <aside className={`sticky top-[49px] flex h-[calc(100vh-49px)] w-60 shrink-0 flex-col ${cfg.aside}`}>
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">D</span>
          <div>
            <p className={`text-sm font-bold ${cfg.brand}`}>D&nbsp;H&amp;A</p>
            <p className="text-[11px] text-slate-400">Админ-панель</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 px-3 py-1">
          {NAV.map((n) => {
            const active = !!n.active;
            const shape = cfg.pill ? 'rounded-full' : 'rounded-lg';
            return (
              <a key={n.key} href="#" onClick={(e) => e.preventDefault()}
                className={`relative flex items-center gap-3 ${shape} px-3 py-2 text-sm transition ${active ? cfg.itemActive : cfg.itemBase}`}>
                {active && cfg.itemActiveBar ? <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-indigo-500" /> : null}
                <Icon d={n.icon} />
                {n.label}
              </a>
            );
          })}
        </nav>
        <div className="border-t border-black/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">ВП</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">Владелец</p>
              <p className="truncate text-[11px] text-slate-400">owner@dha.local</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Контент */}
      <main className="min-w-0 flex-1 px-8 py-6">
        {/* Топбар */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Дашборд</h1>
            <p className="text-sm text-slate-500">Сводка по сети · сегодня, 7 июля</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-400 ring-1 ring-black/10 sm:flex">
              <Icon d={ICONS.search} className="h-4 w-4" /> Поиск…
            </div>
            <button className="grid h-9 w-9 place-items-center rounded-lg bg-white text-slate-500 ring-1 ring-black/10 hover:bg-slate-50"><Icon d={ICONS.bell} className="h-[18px] w-[18px]" /></button>
            <button className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700">
              <Icon d={ICONS.plus} className="h-4 w-4" /> Добавить бронирование
            </button>
          </div>
        </div>

        {/* KPI */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {KPIS.map((k) => {
            const t = toneMap[k.tone]!;
            return (
              <div key={k.label} className="relative overflow-hidden rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(30,27,75,0.04),0_4px_16px_rgba(30,27,75,0.06)] ring-1 ring-black/[0.04]">
                {cfg.cardAccent ? <span className={`absolute inset-x-0 top-0 h-1 ${t.bar}`} /> : null}
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm text-slate-500">{k.label}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${t.bg} ${t.text}`}>{k.delta}</span>
                </div>
                <p className="text-2xl font-bold tracking-tight">{k.value}</p>
              </div>
            );
          })}
        </div>

        {/* Таблица */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(30,27,75,0.04),0_4px_16px_rgba(30,27,75,0.06)] ring-1 ring-black/[0.04]">
          <div className="flex items-center justify-between border-b border-black/5 px-5 py-3.5">
            <p className="font-semibold">Ближайшие бронирования</p>
            <a href="#" onClick={(e) => e.preventDefault()} className="text-sm font-medium text-indigo-600 hover:underline">Все брони →</a>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-5 py-2.5 font-medium">Гость</th>
                <th className="px-3 py-2.5 font-medium">Даты</th>
                <th className="px-3 py-2.5 font-medium">Категория</th>
                <th className="px-3 py-2.5 font-medium">Статус</th>
                <th className="px-5 py-2.5 text-right font-medium">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((r, i) => {
                const s = STATUS[r.st]!;
                return (
                  <tr key={i} className="border-t border-black/[0.04] transition hover:bg-slate-50/70">
                    <td className="px-5 py-3 font-medium">{r.guest}</td>
                    <td className="px-3 py-3 text-slate-500">{r.dates}</td>
                    <td className="px-3 py-3 text-slate-500">{r.cat}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${s.chip}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} /> {s.label}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right font-semibold tabular-nums">{r.sum}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
