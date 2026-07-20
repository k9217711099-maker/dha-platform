'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { adminApi, adminToken, opsStreamUrl, staffStreamUrl } from '../lib/api';
import { useAdminMe } from '../lib/use-admin';

const RAIL_KEY = 'dha_sidebar_railed';

/** Иконки навигации (inline SVG, без эмодзи). */
const ICONS = {
  dash: 'M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-5H4v5Z',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  building: 'M4 22V4a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v18M15 9h4a1 1 0 0 1 1 1v12M8 7h3M8 11h3M8 15h3',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  sparkle: 'M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4L12 3Z',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h2l4 4V6L6 10H4a1 1 0 0 0-1 1Zm14-6v14',
  wallet: 'M3 7h18v12H3V7Zm0 0l2-3h11l2 3M16 13h2',
  key: 'M15 7a4 4 0 1 1-4 4M11 11l-7 7v3h3l1-1v-2h2v-2h2l1.5-1.5',
  calendar: 'M8 2v4M16 2v4M3 8h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm4 12l2 2 4-4',
  grid: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
  tag: 'M20.6 13.4l-7.2 7.2a1.9 1.9 0 0 1-2.7 0L3 13V4a1 1 0 0 1 1-1h9l7.6 7.6a1.9 1.9 0 0 1 0 2.8ZM7.5 7.5h.01',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z',
  droplet: 'M12 22a7 7 0 0 0 7-7c0-5-7-13-7-13S5 10 5 15a7 7 0 0 0 7 7Z',
  wrench: 'M14.7 6.3a4 4 0 0 0 5 5l-2.1 2.1-5-5 2.1-2.1ZM12.6 8.4L4 17l3 3 8.6-8.6',
  clipboard: 'M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1ZM8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2M9 14l2 2 4-4',
  ticket: 'M3 8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 2 2 0 0 0 0-4Zm10-2v12',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  box: 'M21 8l-9-5-9 5 9 5 9-5Zm0 0v8l-9 5-9-5V8',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm0 0v6h6M8 13h8M8 17h8',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5 5h14l3 7v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-6l3-7Z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  truck: 'M1 4h15v12H1zM16 8h4l3 3v5h-7M5.5 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm12 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  gauge: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18ZM12 12l4-2',
  pin: 'M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11ZM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  activity: 'M22 12h-4l-3 9L9 3l-3 9H2',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Zm0 0A2.5 2.5 0 0 0 6.5 22H20M9 7h7',
  download: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  chat: 'M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z',
  award: 'M8 21h8M12 17v4M6 4h12v4a6 6 0 0 1-12 0V4ZM6 6H3v1a3 3 0 0 0 3 3M18 6h3v1a3 3 0 0 0-3 3',
} as const;

type IconKey = keyof typeof ICONS;
type Item = { href: string; perm: string | null; label: string; icon: IconKey };
type Section = { title: string; dot: string; items: Item[] };

const NavIcon = ({ icon }: { icon: IconKey }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0"><path d={ICONS[icon]} /></svg>
);

/** Одиночные пункты верхнего уровня (perm: null — виден всегда). */
const TOP: Item[] = [
  { href: '/', perm: null, label: 'Дашборд', icon: 'dash' },
  { href: '/analytics', perm: 'analytics', label: 'Аналитика', icon: 'chart' },
];

/** Разделы с подпунктами (сворачиваемые). dot — цветовой акцент раздела. */
const SECTIONS: Section[] = [
  {
    title: 'Настройки гостиниц', dot: 'bg-indigo-400',
    items: [
      { href: '/settings/room-fund', perm: 'pms_roomtypes', label: 'Номерной фонд', icon: 'building' },
      { href: '/amenities', perm: 'amenities', label: 'Удобства и фильтры', icon: 'sliders' },
      { href: '/extras', perm: 'extras', label: 'Доп. услуги', icon: 'sparkle' },
      { href: '/settings/marketing', perm: 'pms_marketing', label: 'Маркетинг', icon: 'megaphone' },
      { href: '/settings/finance', perm: 'pms_finance', label: 'Финансы', icon: 'wallet' },
      { href: '/settings/checkin-funnel', perm: 'checkin_funnel_manage', label: 'Заселение (воронка)', icon: 'key' },
      { href: '/settings/notifications', perm: 'notif_templates', label: 'Шаблоны уведомлений', icon: 'megaphone' },
      { href: '/locks', perm: 'locks', label: 'Замки и двери', icon: 'key' },
    ],
  },
  {
    title: 'PMS · Управление', dot: 'bg-sky-400',
    items: [
      { href: '/pms/bookings', perm: 'pms_bookings', label: 'Бронирования', icon: 'calendar' },
      { href: '/pms/arrivals', perm: 'checkin_desk', label: 'Заезды', icon: 'key' },
      { href: '/pms/shakhmatka', perm: 'pms_availability', label: 'Шахматка', icon: 'grid' },
      { href: '/pms/rates', perm: 'pms_rates', label: 'Тарифы и ограничения', icon: 'tag' },
      { href: '/pms/channels', perm: 'pms_channels', label: 'Каналы продаж', icon: 'globe' },
    ],
  },
  {
    // Задачи и Уборка (TASKS-HOUSEKEEPING-TZ) — Operations 2.0 по образцу TeamJet.
    title: 'Операции', dot: 'bg-cyan-400',
    items: [
      { href: '/ops/tasks', perm: 'ops_tasks', label: 'Задачи', icon: 'clipboard' },
      { href: '/ops/cleaning/plan', perm: 'ops_cleaning_plan', label: 'План уборок', icon: 'droplet' },
      { href: '/ops/checklists', perm: 'ops_checklists', label: 'Чек-листы', icon: 'clipboard' },
      { href: '/ops/reports', perm: 'ops_reports', label: 'Отчёты', icon: 'chart' },
      { href: '/ops/qr', perm: 'ops_settings', label: 'QR-коды объектов', icon: 'grid' },
      { href: '/ops/settings', perm: 'ops_settings', label: 'Настройки', icon: 'sliders' },
    ],
  },
  {
    title: 'Гости и продажи', dot: 'bg-emerald-400',
    items: [
      { href: '/checkins', perm: 'checkins', label: 'Онлайн-регистрации', icon: 'clipboard' },
      { href: '/promocodes', perm: 'promocodes', label: 'Промокоды', icon: 'ticket' },
      { href: '/guests', perm: 'guests', label: 'Гости', icon: 'users' },
    ],
  },
  {
    title: 'Склад', dot: 'bg-amber-400',
    items: [
      { href: '/warehouse', perm: 'wh_dashboard', label: 'Дашборд', icon: 'dash' },
      { href: '/warehouse/balances', perm: 'wh_balances', label: 'Остатки', icon: 'box' },
      { href: '/warehouse/documents', perm: 'wh_documents', label: 'Документы', icon: 'file' },
      { href: '/warehouse/requests', perm: 'wh_requests', label: 'Заявки', icon: 'inbox' },
      { href: '/warehouse/inventory', perm: 'wh_inventory', label: 'Инвентаризация', icon: 'clipboard' },
      { href: '/warehouse/items', perm: 'wh_items', label: 'Номенклатура', icon: 'list' },
      { href: '/warehouse/suppliers', perm: 'wh_suppliers', label: 'Поставщики', icon: 'truck' },
      { href: '/warehouse/norms', perm: 'wh_reports', label: 'Нормы и перерасход', icon: 'gauge' },
      { href: '/warehouse/reports', perm: 'wh_reports', label: 'Отчёты', icon: 'chart' },
      { href: '/warehouse/addresses', perm: 'wh_addresses', label: 'Адреса и склады', icon: 'pin' },
    ],
  },
  {
    title: 'База знаний и Диск', dot: 'bg-teal-400',
    items: [
      { href: '/kb', perm: 'kb_view', label: 'Статьи и регламенты', icon: 'book' },
      { href: '/kb/import', perm: 'kb_import', label: 'Импорт из Bitrix24', icon: 'download' },
      { href: '/drive', perm: 'drive_view', label: 'Диск', icon: 'folder' },
      { href: '/secrets', perm: 'secrets_view', label: 'Секреты', icon: 'key' },
      { href: '/links', perm: 'drive_manage', label: 'Публичные ссылки', icon: 'globe' },
    ],
  },
  {
    title: 'AI и коммуникации', dot: 'bg-violet-400',
    items: [
      { href: '/staff-chat', perm: 'staff_chat', label: 'Мессенджер', icon: 'chat' },
      { href: '/ai/copilot', perm: 'ai_copilot', label: 'AI-копилот', icon: 'sparkle' },
      { href: '/ai/inbox', perm: 'guest_inbox', label: 'Лента эскалаций', icon: 'inbox' },
      { href: '/ai/qa', perm: 'ai_qa', label: 'Качество чатов', icon: 'gauge' },
      { href: '/ai/settings', perm: 'ai_agent', label: 'Настройки и каналы', icon: 'sliders' },
    ],
  },
  {
    title: 'Команда', dot: 'bg-fuchsia-400',
    items: [
      { href: '/bonuses', perm: 'bonus_view', label: 'Бонусы', icon: 'award' },
    ],
  },
  {
    title: 'Система', dot: 'bg-rose-400',
    items: [
      { href: '/sync-logs', perm: 'sync', label: 'Логи интеграций', icon: 'activity' },
      { href: '/roles', perm: 'roles', label: 'Сотрудники и роли', icon: 'shield' },
    ],
  },
];

/** Нормализация для поиска: нижний регистр, ё→е. */
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');
/** Умное совпадение: подстрока или последовательность символов (fuzzy). */
function fuzzy(query: string, text: string): boolean {
  const nq = norm(query).trim(); const nt = norm(text);
  if (!nq) return false;
  if (nt.includes(nq)) return true;
  let i = 0; for (const ch of nt) { if (ch === nq[i]) i++; if (i === nq.length) return true; }
  return false;
}

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const me = useAdminMe();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  // Режим «рельса»: узкая панель с иконками, разворачивается по наведению (JS-hover).
  const [railed, setRailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  // Счётчики уведомлений (§4): непрочитанные сообщения + новые задачи.
  // Realtime: SSE мессенджера и задач будят пересчёт сразу при событии; опрос раз в ~25 c — fallback.
  const [badges, setBadges] = useState<Record<string, number>>({});
  useEffect(() => {
    if (!me) return;
    let alive = true;
    const poll = async () => {
      const [chat, ops, inbox] = await Promise.all([
        me.permissions.includes('staff_chat') ? adminApi.staffUnread().then((r) => r.unread).catch(() => 0) : Promise.resolve(0),
        me.permissions.includes('ops_tasks') ? adminApi.opsBadge().then((r) => r.count).catch(() => 0) : Promise.resolve(0),
        me.permissions.includes('guest_inbox') ? adminApi.inboxUnread().then((r) => r.count).catch(() => 0) : Promise.resolve(0),
      ]);
      if (alive) setBadges({ '/staff-chat': chat, '/ops/tasks': ops, '/ai/inbox': inbox });
    };
    void poll();
    const t = setInterval(() => void poll(), 25_000);
    // Событие из SSE → пересчёт с лёгким дебаунсом (пачка событий = один запрос).
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const kick = () => { if (debounce) clearTimeout(debounce); debounce = setTimeout(() => void poll(), 400); };
    const sources: EventSource[] = [];
    const listen = (url: string | null) => {
      if (!url || typeof EventSource === 'undefined') return;
      try {
        const es = new EventSource(url);
        es.onmessage = (ev) => { try { if (JSON.parse(ev.data as string).kind !== 'ping') kick(); } catch { /* ignore */ } };
        sources.push(es);
      } catch { /* SSE не критичен — остаётся опрос */ }
    };
    if (me.permissions.includes('staff_chat')) listen(staffStreamUrl());
    if (me.permissions.includes('ops_tasks')) listen(opsStreamUrl());
    return () => { alive = false; clearInterval(t); if (debounce) clearTimeout(debounce); for (const es of sources) es.close(); };
  }, [me]);
  useEffect(() => { setRailed(typeof window !== 'undefined' && localStorage.getItem(RAIL_KEY) === '1'); }, []);
  const toggleRail = () => setRailed((r) => {
    const nv = !r;
    try { localStorage.setItem(RAIL_KEY, nv ? '1' : '0'); } catch { /* ignore */ }
    if (nv) setHovered(false); // при сворачивании — сразу узкая, даже если курсор над панелью
    return nv;
  });
  const expanded = !railed || hovered; // развёрнута ли панель прямо сейчас

  const allowed = (perm: string | null) => perm === null || (me?.permissions.includes(perm) ?? false);
  const isActive = (href: string) =>
    href === '/' || href === '/warehouse' || href === '/kb' ? pathname === href : pathname.startsWith(href);

  // Плоский индекс всех доступных пунктов для интеллектуального поиска по сайдбару.
  const searchIndex = useMemo(() => {
    const rows: { href: string; label: string; icon: IconKey; section: string }[] = [];
    for (const n of TOP) if (allowed(n.perm)) rows.push({ href: n.href, label: n.label, icon: n.icon, section: 'Основное' });
    for (const sec of SECTIONS) for (const n of sec.items) if (allowed(n.perm)) rows.push({ href: n.href, label: n.label, icon: n.icon, section: sec.title });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.permissions]);
  const q = query.trim();
  const results = q ? searchIndex.filter((r) => fuzzy(q, r.label) || fuzzy(q, r.section)).slice(0, 12) : [];
  // Умные переходы к данным (не только по разделам): гость / бронь по подстроке.
  const smartAll: { label: string; href: string; icon: IconKey; perm: string }[] = [
    { label: `Найти гостя: «${q}»`, href: `/guests?q=${encodeURIComponent(q)}`, icon: 'users', perm: 'guests' },
    { label: `Бронь: «${q}»`, href: `/pms/bookings?q=${encodeURIComponent(q)}`, icon: 'calendar', perm: 'pms_bookings' },
  ];
  const smart = q.length >= 2 ? smartAll.filter((x) => allowed(x.perm)) : [];
  const go = (href: string) => { setQuery(''); router.push(href); };

  const linkCls = (href: string) =>
    `relative flex items-center gap-2.5 rounded-lg border-l-[3px] px-3 py-2 text-sm transition ${
      isActive(href)
        ? 'border-primary bg-primary-100 font-semibold text-primary-700 shadow-sm'
        : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-ink'
    }`;

  // Подпись отображается только в развёрнутом состоянии; в узком — только иконки.
  const Label = ({ children }: { children: ReactNode }) => (expanded ? <span className="min-w-0 truncate whitespace-nowrap">{children}</span> : null);
  // Счётчик уведомлений у пункта меню (§4): в развёрнутом — пилюля с числом, в узком — красная точка на иконке.
  const NavBadge = ({ href }: { href: string }) => {
    const n = badges[href] ?? 0;
    if (n <= 0) return null;
    return expanded
      ? <span className="ml-auto inline-flex min-w-[18px] shrink-0 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-semibold leading-5 text-white">{n > 99 ? '99+' : n}</span>
      : <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />;
  };

  return (
    // Спейсер резервирует ширину в потоке; сама панель — fixed-оверлей, растёт по наведению.
    <div className={`${railed ? 'w-16' : 'w-64'} shrink-0`}>
      <aside
        onMouseEnter={() => railed && setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={`fixed inset-y-0 left-0 z-30 flex h-screen flex-col overflow-hidden border-r border-ink/[0.06] bg-white transition-[width] duration-200 ease-out ${expanded ? 'w-64' : 'w-16'} ${railed && hovered ? 'shadow-2xl' : ''}`}
      >
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-base font-extrabold text-white shadow-sm">D</span>
          {expanded && (
            <div className="min-w-0">
              <p className="whitespace-nowrap text-sm font-bold tracking-tight text-ink">D&nbsp;H&amp;A</p>
              <p className="whitespace-nowrap text-[11px] text-slate-400">Административная панель</p>
            </div>
          )}
        </div>

        {/* Интеллектуальный поиск по разделам и данным */}
        {expanded && (
          <div className="px-3 pb-1 pt-1">
            <div className="relative">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"><path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35" /></svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); if (e.key === 'Enter') { const first = [...smart, ...results][0]; if (first) go(first.href); } }}
                placeholder="Поиск по меню, гостям, броням…"
                className="w-full rounded-lg border border-ink/10 bg-slate-50 py-2 pl-8 pr-7 text-sm text-ink placeholder:text-slate-400 focus:border-primary focus:bg-white focus:outline-none"
              />
              {query ? <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-ink" title="Очистить">×</button> : null}
            </div>
          </div>
        )}

        <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-1">
          {expanded && q ? (
            <div className="space-y-0.5">
              {smart.map((n) => (
                <button key={n.href} type="button" onClick={() => go(n.href)} className="flex w-full items-center gap-2.5 rounded-lg border-l-[3px] border-transparent bg-primary-50/60 px-3 py-2 text-left text-sm text-primary-700 transition hover:bg-primary-100">
                  <NavIcon icon={n.icon} />
                  <span className="min-w-0 truncate">{n.label}</span>
                </button>
              ))}
              {results.map((n) => (
                <button key={n.href} type="button" onClick={() => go(n.href)} className={linkCls(n.href)}>
                  <NavIcon icon={n.icon} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{n.label}</span>
                    <span className="truncate text-[10px] font-normal text-slate-400">{n.section}</span>
                  </span>
                </button>
              ))}
              {smart.length === 0 && results.length === 0 ? <p className="px-3 py-4 text-sm text-slate-400">Ничего не найдено.</p> : null}
            </div>
          ) : (
          <>
          {TOP.filter((n) => allowed(n.perm)).map((n) => (
            <Link key={n.href} href={n.href} className={linkCls(n.href)} title={expanded ? undefined : n.label}>
              <NavIcon icon={n.icon} />
              <Label>{n.label}</Label>
              <NavBadge href={n.href} />
            </Link>
          ))}

          {SECTIONS.map((section) => {
            const items = section.items.filter((n) => allowed(n.perm));
            if (items.length === 0) return null;
            const open = !expanded ? true : !(collapsed[section.title] ?? false);
            return (
              <div key={section.title} className="pt-3">
                <button
                  type="button"
                  onClick={() => setCollapsed((s) => ({ ...s, [section.title]: !(s[section.title] ?? false) }))}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 transition hover:text-slate-600"
                >
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${section.dot}`} />
                  <Label>{section.title}</Label>
                  {expanded ? <span className={`ml-auto shrink-0 text-slate-300 transition ${open ? '' : '-rotate-90'}`}>▾</span> : null}
                </button>
                {open && (
                  <div className="mt-0.5 space-y-0.5">
                    {items.map((n) => (
                      <Link key={n.href} href={n.href} className={linkCls(n.href)} title={expanded ? undefined : n.label}>
                        <NavIcon icon={n.icon} />
                        <Label>{n.label}</Label>
                        <NavBadge href={n.href} />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          </>
          )}
        </nav>

        <div className="border-t border-ink/[0.06] px-4 py-3">
          <button
            type="button"
            onClick={toggleRail}
            title={railed ? 'Закрепить развёрнутое меню' : 'Свернуть меню'}
            className="mb-2 flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-ink"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={`h-[18px] w-[18px] shrink-0 transition-transform ${railed ? 'rotate-180' : ''}`}><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg>
            <Label>{railed ? 'Развернуть' : 'Свернуть меню'}</Label>
          </button>
          {me && (
            <Link href="/profile" title="Мой профиль" className="mb-2.5 flex items-center gap-2.5 rounded-lg px-1 py-1 transition hover:bg-slate-50">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-100 text-xs font-bold text-primary-700">
                {(me.name ?? me.email).slice(0, 2).toUpperCase()}
              </span>
              {expanded && (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{me.name ?? me.email}</p>
                  <p className="truncate text-xs text-slate-400">{me.roleName} · Мой профиль</p>
                </div>
              )}
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              adminToken.clear();
              router.push('/login');
            }}
            title={expanded ? undefined : 'Выйти'}
            className="flex w-full items-center gap-2.5 rounded-lg border border-ink/10 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
            <Label>Выйти</Label>
          </button>
        </div>
      </aside>
    </div>
  );
}
