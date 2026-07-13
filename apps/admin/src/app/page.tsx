'use client';

import Link from 'next/link';
import { Card } from '@dha/ui';
import { useAdminMe, useRequireAdmin } from '../lib/use-admin';

const SECTIONS = [
  { href: '/analytics', perm: 'analytics', title: 'Аналитика', desc: 'Показатели платформы (§19)' },
  { href: '/room-types', perm: 'room_types', title: 'Карточки номеров', desc: 'Фото, описание, удобства, площадь категорий' },
  { href: '/amenities', perm: 'amenities', title: 'Удобства и фильтры', desc: 'Словарь удобств для фильтров и карточек' },
  { href: '/extras', perm: 'extras', title: 'Доп. услуги', desc: 'Конструктор апселлов (завтрак, трансфер и др.)' },
  { href: '/checkins', perm: 'checkins', title: 'Онлайн-регистрации', desc: 'Очередь на проверку, подтверждение/отклонение' },
  { href: '/locks', perm: 'locks', title: 'Замки и двери', desc: 'TTLock: привязка, пароли, eKey, открытие, журнал' },
  { href: '/promocodes', perm: 'promocodes', title: 'Промокоды', desc: 'Создание и управление' },
  { href: '/sync-logs', perm: 'sync', title: 'Логи интеграций', desc: 'Синхронизации и ошибки' },
  { href: '/guests', perm: 'guests', title: 'Гость', desc: 'Профиль, лояльность, ручные операции, ключи' },
  { href: '/roles', perm: 'roles', title: 'Роли и доступы', desc: 'Роли, права разделов, сотрудники' },
  { href: '/warehouse', perm: 'wh_dashboard', title: 'Склад · Дашборд', desc: 'Стоимость остатков, ниже минимума, движения (§6.1)' },
  { href: '/warehouse/balances', perm: 'wh_balances', title: 'Склад · Остатки', desc: 'Остатки по складам и адресам, фильтры' },
  { href: '/warehouse/documents', perm: 'wh_documents', title: 'Склад · Документы', desc: 'Приход и проведение (регистр движений)' },
  { href: '/warehouse/requests', perm: 'wh_requests', title: 'Склад · Заявки', desc: 'Пополнение по par stock, согласование, перемещение' },
  { href: '/warehouse/inventory', perm: 'wh_inventory', title: 'Склад · Инвентаризация', desc: 'Снимок остатка, факт, расхождения, корректировки' },
  { href: '/warehouse/items', perm: 'wh_items', title: 'Склад · Номенклатура', desc: 'Позиции, категории, нормы, учёт сроков' },
  { href: '/warehouse/suppliers', perm: 'wh_suppliers', title: 'Склад · Поставщики', desc: 'Справочник поставщиков' },
  { href: '/warehouse/norms', perm: 'wh_reports', title: 'Склад · Нормы и перерасход', desc: 'Нормы расхода и сравнение факта с нормативом (§7)' },
  { href: '/warehouse/reports', perm: 'wh_reports', title: 'Склад · Отчёты', desc: 'Остатки, движение, расход, сроки, расхождения (§6.7)' },
  { href: '/warehouse/addresses', perm: 'wh_addresses', title: 'Склад · Адреса и склады', desc: 'Объекты сети и их склады' },
];

export default function AdminHome() {
  const ready = useRequireAdmin();
  const me = useAdminMe();
  if (!ready || !me) return <main className="px-8 py-12 text-dark-gray">Загрузка…</main>;

  const sections = SECTIONS.filter((s) => me.permissions.includes(s.perm));

  return (
    <main className="px-8 py-8">
      <div className="mb-1">
        <h1 className="text-3xl font-light text-ink">Административная панель</h1>
        <p className="mt-1 text-sm text-dark-gray">
          Добро пожаловать, {me.name ?? me.email} · доступ: {me.roleName}
        </p>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sections.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="h-full transition hover:border-ink/30 hover:shadow-sm">
              <h2 className="text-lg text-ink">{s.title}</h2>
              <p className="mt-1 text-sm text-dark-gray">{s.desc}</p>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
