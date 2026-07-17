import { z } from 'zod';

/**
 * Схема переменных окружения. Валидируется при старте — приложение не
 * поднимется с некорректной конфигурацией (fail-fast).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),

  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),

  /** Ключ шифрования ПДн (AES-256-GCM), 32 байта в base64. */
  PII_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'PII_ENCRYPTION_KEY должен быть 32 байтами в base64',
    }),

  /** Длина OTP-кода и время жизни (сек). */
  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  OTP_TTL: z.coerce.number().int().positive().default(300),

  /** Провайдер SMS: dev (лог) или smsc. */
  SMS_PROVIDER: z.enum(['dev', 'smsc']).default('dev'),
  SMS_API_LOGIN: z.string().optional(),
  SMS_API_PASSWORD: z.string().optional(),

  /** Интеграция Bnovo: mock (in-memory) или http (реальный API). */
  BNOVO_PROVIDER: z.enum(['mock', 'http']).default('mock'),
  BNOVO_API_BASE: z.string().url().default('https://api.pms.bnovo.ru'),
  BNOVO_API_KEY: z.string().optional(),
  /** Числовой ID аккаунта Bnovo (поле `id` в POST /api/v1/auth). */
  BNOVO_ACCOUNT_ID: z.coerce.number().int().optional(),
  /** CRON-расписание синхронизации каталога (по умолчанию каждые 10 мин). */
  BNOVO_SYNC_CRON: z.string().default('0 */10 * * * *'),

  /**
   * Активный платёжный шлюз. Если не задан — определяется по YOOKASSA_PROVIDER
   * (обратная совместимость): 'yookassa' → yookassa, иначе → mock.
   *  - mock      — in-memory (разработка/демо);
   *  - yookassa  — ЮKassa REST API v3 (эквайринг + фискализация «из коробки»);
   *  - bspb      — Банк «Санкт-Петербург», платёжный шлюз (карты + СБП);
   *  - paykeeper — PayKeeper (JSON API: счёт + оплата, карты + СБП).
   */
  PAYMENT_PROVIDER: z.enum(['mock', 'yookassa', 'bspb', 'paykeeper']).optional(),

  /** Платёжный шлюз ЮKassa: mock (in-memory) или yookassa (реальный API). */
  YOOKASSA_PROVIDER: z.enum(['mock', 'yookassa']).default('mock'),
  YOOKASSA_SHOP_ID: z.string().optional(),
  YOOKASSA_SECRET_KEY: z.string().optional(),

  /**
   * Банк «Санкт-Петербург» (интернет-эквайринг). Server-to-server REST шлюз,
   * Basic-auth (мерчант) + клиентский сертификат. Тест: https://pgtest.bspb.ru,
   * бой: https://pg.bspb.ru. Точные пути/поля — по полному API-референсу БСПБ
   * (раздел «Базовые запросы») и письму internet_acquiring@bspb.ru.
   */
  BSPB_API_BASE: z.string().url().default('https://pgtest.bspb.ru'),
  BSPB_MERCHANT_ID: z.string().optional(),
  BSPB_USERNAME: z.string().optional(),
  BSPB_PASSWORD: z.string().optional(),
  /** Клиентский сертификат mTLS (PEM), путь к файлу — опционально. */
  BSPB_CERT_PATH: z.string().optional(),
  BSPB_CERT_KEY_PATH: z.string().optional(),

  /**
   * PayKeeper (JSON API, PAYMENT_PROVIDER=paykeeper). Server-to-server:
   * Basic-auth (логин/пароль ЛК) + токен (GET /info/settings/token/), создание
   * счёта POST /change/invoice/preview/. SERVER — адрес ЛК мерчанта
   * (напр. https://demo.server.paykeeper.ru). SECRET — «секретное слово» для
   * проверки подписи callback. Реквизиты вводятся в админке (env — запас).
   */
  PAYKEEPER_SERVER: z.string().optional(),
  PAYKEEPER_USER: z.string().optional(),
  PAYKEEPER_PASSWORD: z.string().optional(),
  PAYKEEPER_SECRET: z.string().optional(),

  /** URL возврата после оплаты (страница ЛК). */
  PAYMENT_RETURN_URL: z.string().url().default('http://localhost:3000/bookings'),
  /** Cron фолбэк-поллинга статусов платежей (подстраховка к webhook). */
  PAYMENT_SYNC_CRON: z.string().default('0 * * * * *'),

  /**
   * Фискализация чеков (54-ФЗ). Эквайринг БСПБ, в отличие от ЮKassa, чеки в ОФД
   * НЕ пробивает — нужен отдельный фискальный провайдер (онлайн-касса):
   *  - none — не фискализировать через нашу систему (напр. чек бьёт эквайер);
   *  - mock — эмуляция (dev): пишем в лог, возвращаем фискальный номер;
   *  - atol — АТОЛ Онлайн v4 (getToken → sell → report).
   */
  FISCAL_PROVIDER: z.enum(['none', 'mock', 'atol']).default('none'),
  ATOL_API_BASE: z.string().url().default('https://online.atol.ru/possystem/v4'),
  ATOL_LOGIN: z.string().optional(),
  ATOL_PASSWORD: z.string().optional(),
  /** Код группы ККТ в АТОЛ Онлайн. */
  ATOL_GROUP_CODE: z.string().optional(),
  /** ИНН организации и адрес расчётов для чека. */
  ATOL_INN: z.string().optional(),
  ATOL_PAYMENT_ADDRESS: z.string().optional(),
  /** Система налогообложения (osn, usn_income, usn_income_outcome, envd, esn, patent). */
  ATOL_SNO: z.string().default('usn_income'),

  /** Хранилище документов: mock (in-memory) или s3 (Yandex Object Storage / MinIO). */
  STORAGE_PROVIDER: z.enum(['mock', 's3']).default('mock'),
  S3_ENDPOINT: z.string().url().default('https://storage.yandexcloud.net'),
  S3_REGION: z.string().default('ru-central1'),
  S3_BUCKET: z.string().default('dha-documents'),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  /** Срок хранения сканов документов, дней (152-ФЗ, §18.2). */
  DOCUMENT_RETENTION_DAYS: z.coerce.number().int().positive().default(365),

  /** Цифровой ключ TTLock: mock (in-memory) или http (реальный API). */
  TTLOCK_PROVIDER: z.enum(['mock', 'http']).default('mock'),
  TTLOCK_CLIENT_ID: z.string().optional(),
  TTLOCK_CLIENT_SECRET: z.string().optional(),
  /** Хост TTLock Cloud API (EU-узел по умолчанию). */
  TTLOCK_API_BASE: z.string().url().default('https://euapi.ttlock.com'),
  /** Аккаунт-владелец замков (OAuth2 password grant). */
  TTLOCK_USERNAME: z.string().optional(),
  TTLOCK_PASSWORD: z.string().optional(),
  /**
   * Режим выдачи PIN:
   *  - get: TTLock генерирует код по алгоритму (БЕЗ шлюза; код задаёт система);
   *  - add: записать свой код (нужен шлюз или Bluetooth).
   */
  TTLOCK_PASSCODE_MODE: z.enum(['get', 'add']).default('get'),
  /** Для режима add: 2 — Bluetooth, 3 — через шлюз/Wi-Fi. */
  TTLOCK_ADD_TYPE: z.coerce.number().int().default(3),
  /** Единый код на все двери номера: длина PIN (§9.3). По умолчанию 4 знака. */
  TTLOCK_UNIFIED_PIN_LENGTH: z.coerce.number().int().min(4).max(9).default(4),
  /** Сколько раз пытаться записать свой код через шлюз, прежде чем упасть во временный. */
  TTLOCK_ADD_ATTEMPTS: z.coerce.number().int().min(1).default(3),
  /** Смещения окна действия ключа, мин (§9.4): по умолчанию −30 / +30. */
  KEY_PRE_CHECKIN_MINUTES: z.coerce.number().int().nonnegative().default(30),
  KEY_POST_CHECKOUT_MINUTES: z.coerce.number().int().nonnegative().default(30),

  /** Оркестратор заселения (CHECK-IN-TZ §6): горизонт сканирования броней, часов. */
  FUNNEL_HORIZON_HOURS: z.coerce.number().int().positive().default(72),
  /** Эскалация в задачи: гость не готов через N минут после времени заезда. */
  FUNNEL_ESCALATE_AFTER_MINUTES: z.coerce.number().int().nonnegative().default(60),
  /** Авто-незаезд через N часов после заезда (0 — выключено; открытый вопрос ТЗ §16.6). */
  FUNNEL_NO_SHOW_AFTER_HOURS: z.coerce.number().int().nonnegative().default(0),
  /** База URL гостевого портала заселения (magic-link, CHECK-IN-TZ §4). */
  GUEST_PORTAL_BASE_URL: z.string().url().default('http://localhost:3000'),

  /** CRM Bitrix24: mock (in-memory) или http (входящий вебхук REST). */
  BITRIX24_PROVIDER: z.enum(['mock', 'http']).default('mock'),
  BITRIX24_WEBHOOK_URL: z.string().optional(),

  /** Верификация паспорта: mock (демо) или http (self-hosted OCR + Dadata). */
  PASSPORT_PROVIDER: z.enum(['mock', 'http']).default('mock'),
  /** URL self-hosted OCR-сайдкара (PaddleOCR + MRZ). */
  PASSPORT_OCR_URL: z.string().url().default('http://localhost:8077'),
  /** Dadata «Проверка паспорта» (список недействительных МВД). */
  DADATA_API_KEY: z.string().optional(),
  DADATA_SECRET: z.string().optional(),

  /**
   * LLM-провайдер для AI-агентов (решение 2026-07-08 — китайское облако DeepSeek):
   *  - mock     — заглушка без сети (разработка/тесты);
   *  - deepseek — DeepSeek Chat Completions (OpenAI-совместимый; тем же адаптером
   *               через смену DEEPSEEK_API_BASE можно ходить в Qwen/GLM).
   * ПДн: облако за рубежом → обязательно маскирование входящего текста (§8 ТЗ).
   */
  LLM_PROVIDER: z.enum(['mock', 'deepseek']).default('mock'),
  DEEPSEEK_API_BASE: z.string().url().default('https://api.deepseek.com'),
  DEEPSEEK_API_KEY: z.string().optional(),
  /** Основная модель (DeepSeek V4 chat). */
  DEEPSEEK_MODEL: z.string().default('deepseek-chat'),
  /** Быстрая/дешёвая модель для роутинга интента и простых ответов. */
  DEEPSEEK_MODEL_FAST: z.string().default('deepseek-chat'),
  /** Reasoner (R1) для сложного многошагового рассуждения. */
  DEEPSEEK_MODEL_REASONER: z.string().default('deepseek-reasoner'),

  /**
   * Telegram-бот гостевого AI-агента: mock (лог) или http (Bot API). Для http нужен
   * TELEGRAM_BOT_TOKEN (от @BotFather). TELEGRAM_WEBHOOK_SECRET — секрет заголовка
   * X-Telegram-Bot-Api-Secret-Token (задаётся при setWebhook), проверяется на входе.
   */
  TELEGRAM_PROVIDER: z.enum(['mock', 'http']).default('mock'),
  /**
   * Режим приёма входящих Telegram: webhook (Telegram шлёт нам) или polling (мы сами
   * опрашиваем getUpdates). Если не задан — авто: polling при заданном
   * MESSENGER_PROXY_URL (значит сеть блокируется в обе стороны), иначе webhook.
   */
  TELEGRAM_MODE: z.enum(['webhook', 'polling']).optional(),
  TELEGRAM_API_BASE: z.string().url().default('https://api.telegram.org'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  /** Username бота (без @) — для сборки deep-link t.me/<bot>?start=<token> привязки (§13). */
  TELEGRAM_BOT_USERNAME: z.string().optional(),

  /**
   * Прокси для исходящих к заблокированным с РФ-сервера мессенджерам (Telegram/WhatsApp).
   * Формат: http://login:password@host:port. Если задан — запросы к Telegram (и позже
   * WhatsApp) идут через него; DeepSeek и прочее — напрямую. Пусто → напрямую.
   */
  MESSENGER_PROXY_URL: z.string().optional(),

  /**
   * MAX-мессенджер (бот): токен от @MasterBot. Приём входящих — long polling
   * (GET /updates, marker) или webhook (POST /subscriptions). MAX — российская
   * площадка, доступна с РФ-сервера напрямую, прокси не нужен. Токен также можно
   * ввести в админке (Setting поверх env), канал включается без правки .env.
   */
  MAX_API_BASE: z.string().url().default('https://platform-api2.max.ru'),
  MAX_BOT_TOKEN: z.string().optional(),
  MAX_MODE: z.enum(['webhook', 'polling']).default('polling'),
  MAX_WEBHOOK_SECRET: z.string().optional(),

  /**
   * WhatsApp через Baileys (неофициальное подключение личного/бизнес-номера по QR).
   * WA_ENABLED=true поднимает сокет в процессе API; сессия (креды) хранится в БД.
   * Исходящие идут через MESSENGER_PROXY_URL (WhatsApp заблокирован с РФ-сервера).
   * Пейринг (показ QR) запускается из админки — держите отдельный номер под бота.
   */
  WA_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * Папка хранения сессии WhatsApp (Baileys, useMultiFileAuthState). Должна жить
   * ВНЕ git-репозитория, иначе деплой (git reset) сотрёт привязку и потребуется
   * повторный QR. На сервере задайте абсолютный путь, напр. /var/www/dha-data/wa-auth.
   */
  WA_AUTH_DIR: z.string().default('.wa-auth'),
  /**
   * Прокси именно для WhatsApp-сокета (WebSocket). Если WS плохо идёт через
   * HTTP-прокси (зависает «подключение» после сканирования QR) — задайте здесь
   * SOCKS5: socks5://user:pass@host:port. Пусто → используется MESSENGER_PROXY_URL.
   */
  WA_PROXY_URL: z.string().optional(),

  /**
   * SMTP для реальной отправки email (приглашения воронки, подтверждения). Если
   * SMTP_HOST задан — письма уходят через SMTP; иначе DevEmailSender (только лог).
   * SMTP_FROM — адрес отправителя (напр. "D H&A <noreply@nomero.online>").
   */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('D H&A <noreply@nomero.online>'),

  /**
   * Telegram Direct (userbot, GramJS/MTProto) — общение с ЛИЧНОГО аккаунта, а не
   * бота. TG_USERBOT_ENABLED=true подключает сохранённую сессию при старте.
   * api_id/api_hash (my.telegram.org) и телефон вводятся в админке (Setting,
   * зашифровано), env — запасной вариант. Прокси — ОТДЕЛЬНЫЙ SOCKS5
   * (TG_USERBOT_PROXY=socks5://user:pass@host:port), т.к. MTProto не ходит через
   * HTTP-прокси. ⚠️ Неофициально, нарушает ToS Telegram — риск блокировки аккаунта.
   */
  TG_USERBOT_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  TG_USERBOT_API_ID: z.string().optional(),
  TG_USERBOT_API_HASH: z.string().optional(),
  TG_USERBOT_PROXY: z.string().optional(),

  /**
   * Базы знаний, доступные ГОСТЕВОМУ AI-агенту (ID баз через запятую). У страниц KB
   * пока нет флага видимости, поэтому гостю отдаём только явно разрешённые базы.
   * Пусто → гостевой kb_search выключен (без утечки внутренних страниц). Копилот
   * сотрудника ищет по всей базе знаний независимо от этого списка.
   */
  KB_GUEST_BASE_IDS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
});

export type Env = z.infer<typeof envSchema>;

/** Валидатор для @nestjs/config (ConfigModule.forRoot({ validate })). */
export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Некорректная конфигурация окружения:\n${issues}`);
  }
  return parsed.data;
}
