/** Каталог прав доступа (раздел/функция админ-панели). */
export const PERMISSIONS = [
  { key: 'analytics', label: 'Аналитика' },
  { key: 'room_types', label: 'Карточки номеров' },
  { key: 'amenities', label: 'Удобства и фильтры' },
  { key: 'extras', label: 'Доп. услуги' },
  { key: 'checkins', label: 'Онлайн-регистрации' },
  { key: 'checkin_funnel_manage', label: 'Заселение · Конструктор воронки' },
  { key: 'checkin_desk', label: 'Заселение · Очередь заезда (стойка)' },
  { key: 'notif_templates', label: 'Уведомления · Шаблоны' },
  { key: 'locks', label: 'Замки и двери (TTLock)' },
  { key: 'promocodes', label: 'Промокоды' },
  { key: 'guests', label: 'Гости и лояльность' },
  { key: 'sync', label: 'Синхронизация и логи' },
  { key: 'roles', label: 'Роли и доступы' },
  // PMS (собственная платформа бронирования — Путь B / DHP)
  { key: 'pms_dashboard', label: 'PMS · Дашборд' },
  { key: 'pms_properties', label: 'PMS · Объекты размещения' },
  { key: 'pms_roomtypes', label: 'PMS · Категории номеров' },
  { key: 'pms_rooms', label: 'PMS · Номерной фонд' },
  { key: 'pms_bookings', label: 'PMS · Бронирования' },
  { key: 'pms_guest_pii', label: 'PMS · Личные данные гостей в бронях (ФИО/телефон)' },
  { key: 'pms_reopen_checkout', label: 'PMS · Смена статуса после выезда' },
  { key: 'pms_availability', label: 'PMS · Доступность' },
  { key: 'pms_rates', label: 'PMS · Тарифы и ограничения' },
  { key: 'pms_marketing', label: 'PMS · Маркетинг (словари)' },
  { key: 'pms_finance', label: 'PMS · Финансы (реквизиты, оплата)' },
  { key: 'pms_channels', label: 'PMS · Channel Manager' },
  // Задачи и Уборка (TASKS-HOUSEKEEPING-TZ §10) — Operations 2.0 (замена pms_housekeeping/pms_maintenance)
  { key: 'ops_tasks', label: 'Операции · Задачи и уборки (свои)' },
  { key: 'ops_view_group', label: 'Операции · Видимость задач своего отдела' },
  { key: 'ops_view_all', label: 'Операции · Видимость всех задач' },
  { key: 'ops_create', label: 'Операции · Создание задач' },
  { key: 'ops_manage', label: 'Операции · Управление чужими задачами' },
  { key: 'ops_cleaning_plan', label: 'Операции · План уборок' },
  { key: 'ops_inspect', label: 'Операции · Инспекция уборок' },
  { key: 'ops_checklists', label: 'Операции · Конструктор чек-листов' },
  { key: 'ops_settings', label: 'Операции · Настройки (типы, правила, автоматизация)' },
  { key: 'ops_reports', label: 'Операции · Отчёты' },
  { key: 'ops_guest_info', label: 'Операции · Данные гостя в карточке' },
  // Складской учёт (управляющая компания)
  { key: 'wh_dashboard', label: 'Склад · Дашборд' },
  { key: 'wh_balances', label: 'Склад · Остатки' },
  { key: 'wh_items', label: 'Склад · Номенклатура' },
  { key: 'wh_documents', label: 'Склад · Документы' },
  { key: 'wh_requests', label: 'Склад · Заявки' },
  { key: 'wh_inventory', label: 'Склад · Инвентаризации' },
  { key: 'wh_reports', label: 'Склад · Отчёты' },
  { key: 'wh_addresses', label: 'Склад · Адреса и склады' },
  { key: 'wh_suppliers', label: 'Склад · Поставщики' },
  { key: 'wh_costs', label: 'Склад · Закупочные цены' },
  { key: 'wh_approve_writeoff', label: 'Склад · Согласование крупных списаний' },
  // База знаний (KB-DRIVE-TZ.md)
  { key: 'kb_view', label: 'База знаний · Просмотр' },
  { key: 'kb_edit', label: 'База знаний · Редактирование страниц' },
  { key: 'kb_manage', label: 'База знаний · Базы, структура, права' },
  { key: 'kb_import', label: 'База знаний · Импорт (Bitrix24)' },
  // Диск (KB-DRIVE-TZ.md §5)
  { key: 'drive_view', label: 'Диск · Просмотр и скачивание' },
  { key: 'drive_edit', label: 'Диск · Загрузка и изменение файлов' },
  { key: 'drive_manage', label: 'Диск · Публичные ссылки, корзина' },
  { key: 'search_ask', label: 'База знаний · AI-ответы (тратит токены LLM)' },
  // Секреты (KB-DRIVE-TZ.md §8)
  { key: 'secrets_view', label: 'Секреты · Просмотр и раскрытие паролей' },
  { key: 'secrets_manage', label: 'Секреты · Создание, доступы, журнал, ротация' },
  // AI-агенты и коммуникации (AI-COMMUNICATIONS-TZ.md)
  { key: 'ai_copilot', label: 'AI · Копилот сотрудника' },
  { key: 'ai_agent', label: 'AI · Настройка гостевого агента' },
  { key: 'ai_qa', label: 'AI · Контроль качества чатов' },
  { key: 'guest_inbox', label: 'AI · Лента эскалаций (диалоги гостей)' },
  { key: 'staff_chat', label: 'Мессенджер сотрудников (чаты)' },
  // Бонусная программа сотрудников (§7) — нематериальное признание (не путать с баллами лояльности гостей)
  { key: 'bonus_view', label: 'Бонусы · Мой баланс, история, рейтинг команды' },
  { key: 'bonus_award', label: 'Бонусы · Начисление баллов и критерии' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];
export const ALL_PERMISSION_KEYS: PermissionKey[] = PERMISSIONS.map((p) => p.key);

/** Роли по умолчанию (создаются при первом запуске, далее редактируются). */
export const DEFAULT_ROLES: { key: string; name: string; permissions: PermissionKey[] }[] = [
  { key: 'superadmin', name: 'Администратор', permissions: [...ALL_PERMISSION_KEYS] },
  {
    key: 'spir_head',
    name: 'Руководитель СПиР',
    permissions: ['checkins', 'locks', 'guests', 'sync', 'kb_view', 'kb_edit', 'drive_view', 'drive_edit', 'search_ask', 'bonus_view', 'bonus_award'],
  },
  {
    key: 'manager',
    name: 'Управляющий',
    permissions: ['analytics', 'room_types', 'amenities', 'extras', 'promocodes', 'guests', 'kb_view', 'kb_edit', 'drive_view', 'drive_edit', 'search_ask', 'bonus_view', 'bonus_award'],
  },
  // Роли PMS (DHP §5). Владелец/GM видят весь операционный контур; остальные — свой участок.
  {
    key: 'pms_owner',
    name: 'PMS · Владелец / Управляющий',
    permissions: [
      'pms_dashboard', 'pms_properties', 'pms_roomtypes', 'pms_rooms', 'pms_bookings', 'pms_guest_pii', 'pms_reopen_checkout',
      'pms_availability', 'pms_rates', 'pms_marketing', 'pms_finance', 'pms_channels',
      'ops_tasks', 'ops_view_all', 'ops_create', 'ops_manage', 'ops_cleaning_plan', 'ops_inspect', 'ops_checklists', 'ops_settings', 'ops_reports', 'ops_guest_info',
      'extras', 'guests', // каталог услуг + база гостей (автоподстановка, лояльность) нужны в брони
      'bonus_view', 'bonus_award',
    ],
  },
  {
    key: 'pms_gm',
    name: 'PMS · General Manager',
    permissions: [
      'pms_dashboard', 'pms_properties', 'pms_roomtypes', 'pms_rooms', 'pms_bookings', 'pms_guest_pii', 'pms_reopen_checkout',
      'pms_availability', 'pms_marketing', 'pms_finance',
      'ops_tasks', 'ops_view_all', 'ops_create', 'ops_manage', 'ops_cleaning_plan', 'ops_inspect', 'ops_checklists', 'ops_settings', 'ops_reports', 'ops_guest_info',
      'extras', 'guests',
      'bonus_view', 'bonus_award',
    ],
  },
  {
    key: 'pms_frontdesk',
    name: 'PMS · Front Desk / Администратор',
    permissions: ['pms_dashboard', 'pms_bookings', 'pms_guest_pii', 'pms_availability', 'pms_rooms', 'pms_marketing', 'extras', 'guests', 'bonus_view'],
  },
  {
    key: 'pms_revenue',
    name: 'PMS · Revenue Manager',
    permissions: ['pms_dashboard', 'pms_roomtypes', 'pms_availability', 'pms_rates', 'pms_marketing', 'pms_channels'],
  },
  {
    key: 'pms_hk_supervisor',
    name: 'PMS · Housekeeping Supervisor',
    permissions: ['pms_dashboard', 'pms_rooms', 'ops_tasks', 'ops_view_group', 'ops_create', 'ops_manage', 'ops_cleaning_plan', 'ops_inspect', 'ops_checklists', 'ops_reports', 'bonus_view', 'bonus_award'],
  },
  {
    key: 'pms_engineer',
    name: 'PMS · Maintenance / Инженер',
    permissions: ['pms_dashboard', 'pms_rooms', 'ops_tasks', 'ops_view_group', 'ops_create', 'bonus_view'],
  },
  {
    key: 'ops_maid',
    name: 'Операции · Горничная',
    permissions: ['ops_tasks', 'bonus_view'],
  },
  // Складские роли (§3 ТЗ складского учёта). Per-address scoping — через AdminUser.allowedAddressIds.
  {
    key: 'wh_head',
    name: 'Склад · Руководитель УК',
    permissions: [
      'wh_dashboard', 'wh_balances', 'wh_items', 'wh_documents', 'wh_requests',
      'wh_inventory', 'wh_reports', 'wh_addresses', 'wh_suppliers', 'wh_costs', 'wh_approve_writeoff',
    ],
  },
  {
    key: 'wh_keeper',
    name: 'Склад · Кладовщик ЦС',
    permissions: ['wh_dashboard', 'wh_balances', 'wh_items', 'wh_documents', 'wh_requests', 'wh_inventory', 'wh_suppliers', 'wh_costs'],
  },
  {
    key: 'wh_engineer',
    name: 'Склад · Главный инженер',
    permissions: ['wh_dashboard', 'wh_balances', 'wh_documents', 'wh_requests', 'wh_inventory'],
  },
  {
    key: 'wh_housekeeping',
    name: 'Склад · Супервайзер ХС',
    permissions: ['wh_dashboard', 'wh_balances', 'wh_documents', 'wh_requests', 'wh_inventory'],
  },
  {
    key: 'wh_object_manager',
    name: 'Склад · Менеджер объекта',
    permissions: ['wh_dashboard', 'wh_balances', 'wh_documents', 'wh_requests'],
  },
  {
    key: 'wh_finance',
    name: 'Склад · Бухгалтер / финансы',
    permissions: ['wh_dashboard', 'wh_balances', 'wh_documents', 'wh_reports', 'wh_suppliers', 'wh_costs'],
  },
];
