import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../../common/settings/settings.service.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import type { Env } from '../../config/env.schema.js';

/** Ключи Setting для Umnico (токен зашифрован). */
const K = {
  token: 'ai.umnico.token',
} as const;

/** Клиент Umnico (телефон/аватар/имя/ник) — из событий customer.created/updated и lead.changed (#1/#2). */
export type UmnicoCustomer = { phone?: string | null; avatar?: string | null; name?: string | null; username?: string | null };

/** Подключённый в Umnico канал (интеграция). */
export interface UmnicoChannel {
  id: number;
  type: string;
  login: string;
  status: string;
  /** Человекочитаемая подпись для селектов. */
  label: string;
}

export interface UmnicoPublicConfig {
  tokenSet: boolean;
  connected: boolean;
  /** Список подключённых каналов (если токен валиден). */
  channels: UmnicoChannel[];
}

/** Зарегистрированный в Umnico вебхук (GET/POST /v1.3/webhooks). */
export interface UmnicoWebhookEntry {
  id: number;
  url: string;
  name?: string;
  status?: number;
}

/** Русские подписи типов каналов Umnico. */
const TYPE_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  whatsappV2: 'WhatsApp',
  telebot: 'Telegram-бот',
  telegram: 'Telegram',
  telegramV2: 'Telegram',
  instagramV3: 'Instagram',
  fb_messenger: 'Facebook Messenger',
  viber: 'Viber',
  vk: 'ВКонтакте',
  avito: 'Avito',
  ok: 'Одноклассники',
};

/**
 * Конфигурация Umnico (омниканальный агрегатор): токен API вводится в админке и
 * хранится в Setting (зашифрован). Через Umnico подключаются WhatsApp, Telegram,
 * VK, Avito и др. без возни с прокси/api_id — этим занимается Umnico. По аналогии
 * с TelegramConfigService/MaxConfigService.
 */
@Injectable()
export class UmnicoConfigService {
  private readonly logger = new Logger(UmnicoConfigService.name);
  private readonly base: string;

  constructor(
    private readonly settings: SettingsService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.base = this.config.get('UMNICO_API_BASE', { infer: true });
  }

  get apiBase(): string {
    return this.base;
  }

  /** Токен (Setting поверх env), расшифрованный. */
  async token(): Promise<string> {
    const enc = await this.settings.get(K.token);
    return this.decrypt(enc) || this.config.get('UMNICO_TOKEN', { infer: true }) || '';
  }

  async hasToken(): Promise<boolean> {
    return !!(await this.token());
  }

  async save(input: { token?: string }): Promise<void> {
    if (input.token) await this.settings.set(K.token, this.crypto.encryptPii(input.token.trim()));
  }

  /** Заголовки авторизации Umnico (Bearer JWT). */
  private authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  }

  /**
   * Список подключённых каналов из Umnico (GET /v1.3/integrations). Этот запрос лежит в пути
   * загрузки «Диалогов» (channelTypeBySaId), «Заселения» (funnel-config), AI-настроек и
   * «написать первым». ЖЁСТКИЙ предохранитель: Promise.race с таймером на 7с гарантирует
   * возврат даже если fetch/AbortSignal почему-то не прервётся на этом Node — иначе медленный
   * Umnico вешал все эти разделы разом.
   */
  async listChannels(): Promise<UmnicoChannel[]> {
    const token = await this.token();
    if (!token) return [];
    const fetchChannels = async (): Promise<UmnicoChannel[]> => {
      try {
        const res = await fetch(`${this.base}/v1.3/integrations`, {
          headers: this.authHeaders(token),
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return [];
        const data = (await res.json()) as { id: number; type: string; login?: string; status?: string }[];
        return (Array.isArray(data) ? data : []).map((i) => ({
          id: i.id,
          type: i.type,
          login: i.login ?? '',
          status: i.status ?? '',
          label: `${TYPE_LABEL[i.type] ?? i.type}${i.login ? ` · ${i.login}` : ''}`,
        }));
      } catch (e) {
        this.logger.warn(`listChannels: ${(e as Error).message}`);
        return [];
      }
    };
    return Promise.race([
      fetchChannels(),
      new Promise<UmnicoChannel[]>((resolve) => setTimeout(() => resolve([]), 7000)),
    ]);
  }

  /**
   * Тип подканала (whatsapp/telegram/vk/…) по saId — id подключённого канала Umnico.
   * Вебхук message.incoming не всегда отдаёт source.type, но saId в нём есть всегда
   * (он нужен для ответа), а тип канала берём из GET /integrations. Результат кэшируем
   * на 5 минут, чтобы не дёргать Umnico на каждое входящее (#14).
   */
  /**
   * Есть ли в вебхуке вложение/медиа (или это MAX-канал). Такие события кладём в ОТДЕЛЬНЫЙ
   * медиа-буфер, чтобы поток текстовых сообщений (активный аккаунт) их не вытеснял — иначе
   * редкое MAX-фото исчезает из общего буфера до того, как мы успеем снять формат (#6).
   */
  private hasMedia(body: unknown): boolean {
    let found = false;
    const scan = (v: unknown, depth: number): void => {
      if (found || depth > 8 || v == null || typeof v !== 'object') return;
      if (Array.isArray(v)) { for (const x of v) scan(x, depth + 1); return; }
      const o = v as Record<string, unknown>;
      if (Array.isArray(o.attachments) && o.attachments.length) { found = true; return; }
      const t = typeof o.type === 'string' ? o.type.toLowerCase() : '';
      if (['photo', 'image', 'picture', 'video', 'file', 'audio', 'voice', 'document', 'sticker'].includes(t)) {
        found = true; return;
      }
      const saType = (o.sa as { type?: string } | undefined)?.type ?? (o.sender as { type?: string } | undefined)?.type;
      if (typeof saType === 'string' && saType.toLowerCase() === 'max') { found = true; return; }
      for (const val of Object.values(o)) scan(val, depth + 1);
    };
    scan(body, 0);
    return found;
  }

  /**
   * Диагностика (#14/#1/фото): сохраняем последние сырые вебхуки Umnico (с усечением длинных
   * строк), чтобы видеть, где лежат телефон гостя, тип канала и аватар — форматы каналов
   * различаются. События с медиа/MAX дублируем в отдельный буфер `ai.umnico.debug.media`
   * (не вытесняется текстом, URL режем мягче — виден весь формат вложения). Читается через
   * `GET /ai/channels/umnico/debug` (право guests).
   */
  async captureDebug(body: unknown): Promise<void> {
    try {
      const truncTo = (limit: number): unknown =>
        JSON.parse(JSON.stringify(body, (_k, v) => (typeof v === 'string' && v.length > limit ? `${v.slice(0, limit)}…` : v)));
      const now = new Date().toISOString();
      const raw = await this.settings.get('ai.umnico.debug');
      let arr: unknown[] = [];
      try { arr = raw ? (JSON.parse(raw) as unknown[]) : []; } catch { arr = []; }
      arr.unshift({ at: now, body: truncTo(160) });
      await this.settings.set('ai.umnico.debug', JSON.stringify(arr.slice(0, 8)));
      // Медиа/MAX-события — в отдельный буфер (поток текста их не затирает), с полными URL.
      if (this.hasMedia(body)) {
        const mraw = await this.settings.get('ai.umnico.debug.media');
        let marr: unknown[] = [];
        try { marr = mraw ? (JSON.parse(mraw) as unknown[]) : []; } catch { marr = []; }
        marr.unshift({ at: now, body: truncTo(600) });
        await this.settings.set('ai.umnico.debug.media', JSON.stringify(marr.slice(0, 8)));
      }
    } catch {
      /* диагностика не критична */
    }
  }
  /**
   * Диагностика ИСХОДЯЩИХ вложений (#6 MAX): запрос + статус/ответ Umnico на попытку отправить
   * фото/файл — чтобы видеть, ушло ли нативно или упало в фолбэк-ссылку и почему. Последние 5.
   */
  async captureSend(entry: {
    at: string; leadId: string; body: unknown; status: number | string; response: string;
  }): Promise<void> {
    try {
      const raw = await this.settings.get('ai.umnico.debug.send');
      let arr: unknown[] = [];
      try { arr = raw ? (JSON.parse(raw) as unknown[]) : []; } catch { arr = []; }
      arr.unshift(entry);
      await this.settings.set('ai.umnico.debug.send', JSON.stringify(arr.slice(0, 5)));
    } catch {
      /* не критично */
    }
  }
  async captureUpload(entry: {
    at: string; fileUrl: string; kind: string; saId: string | null | undefined; chType: string | undefined;
    result: string | null; error?: string;
  }): Promise<void> {
    try {
      const raw = await this.settings.get('ai.umnico.debug.upload');
      let arr: unknown[] = [];
      try { arr = raw ? (JSON.parse(raw) as unknown[]) : []; } catch { arr = []; }
      arr.unshift(entry);
      await this.settings.set('ai.umnico.debug.upload', JSON.stringify(arr.slice(0, 5)));
    } catch { /* не критично */ }
  }

  async readDebug(): Promise<{ send: unknown[]; media: unknown[]; recent: unknown[]; upload: unknown[] }> {
    const parse = (r: string | null): unknown[] => {
      try { return r ? (JSON.parse(r) as unknown[]) : []; } catch { return []; }
    };
    const [sraw, mraw, raw, uraw] = await Promise.all([
      this.settings.get('ai.umnico.debug.send'),
      this.settings.get('ai.umnico.debug.media'),
      this.settings.get('ai.umnico.debug'),
      this.settings.get('ai.umnico.debug.upload'),
    ]);
    return { send: parse(sraw), media: parse(mraw), recent: parse(raw), upload: parse(uraw) };
  }

  /**
   * Кэш клиентов Umnico (событие customer.created/updated → телефон/аватар/имя гостя по id).
   * Нужен, потому что у Telegram телефон и фото приходят ОТДЕЛЬНЫМ событием, а не в сообщении
   * (в message.sender только username) — связываем с диалогом по customerId (#1/#2).
   */
  private customerKey(id: string): string { return String(id); }
  async saveCustomer(id: string, data: UmnicoCustomer): Promise<void> {
    try {
      const raw = await this.settings.get('ai.umnico.customers');
      let map: Record<string, UmnicoCustomer & { at: number }> = {};
      try { map = raw ? JSON.parse(raw) : {}; } catch { map = {}; }
      const k = this.customerKey(id);
      map[k] = {
        phone: data.phone ?? map[k]?.phone ?? null,
        avatar: data.avatar ?? map[k]?.avatar ?? null,
        name: data.name ?? map[k]?.name ?? null,
        username: data.username ?? map[k]?.username ?? null,
        at: Date.now(),
      };
      // Держим последние 500 клиентов, чтобы Setting не рос бесконечно.
      const entries = Object.entries(map).sort((a, b) => b[1].at - a[1].at).slice(0, 500);
      await this.settings.set('ai.umnico.customers', JSON.stringify(Object.fromEntries(entries)));
      this.customerMapCache = null; // сбросить память-кэш — новые телефон/фото/ник подхватятся сразу
    } catch {
      /* не критично */
    }
  }
  // Память-кэш карты клиентов (TTL 30с): getCustomer/getCustomers зовутся на каждый тред/список,
  // а раньше каждый раз читали Setting и парсили большой JSON (до 500 записей). Сброс — в saveCustomer.
  private customerMapCache: { at: number; map: Record<string, UmnicoCustomer> } | null = null;
  private async customerMap(): Promise<Record<string, UmnicoCustomer>> {
    const now = Date.now();
    if (this.customerMapCache && now - this.customerMapCache.at < 30_000) return this.customerMapCache.map;
    const raw = await this.settings.get('ai.umnico.customers');
    let map: Record<string, UmnicoCustomer> = {};
    try { map = raw ? (JSON.parse(raw) as Record<string, UmnicoCustomer>) : {}; } catch { map = {}; }
    this.customerMapCache = { at: now, map };
    return map;
  }
  async getCustomer(id: string | null | undefined): Promise<UmnicoCustomer | null> {
    if (!id) return null;
    return (await this.customerMap())[this.customerKey(id)] ?? null;
  }
  /** Батч-версия для отображения списка диалогов (одно чтение Setting). */
  async getCustomers(ids: Array<string | null | undefined>): Promise<Map<string, UmnicoCustomer>> {
    const uniq = [...new Set(ids.filter((x): x is string => !!x).map((x) => this.customerKey(x)))];
    if (!uniq.length) return new Map();
    const map = await this.customerMap();
    return new Map(uniq.filter((k) => map[k]).map((k) => [k, map[k]!]));
  }

  private channelsCache: { at: number; list: UmnicoChannel[] } | null = null;
  private channelsInFlight: Promise<UmnicoChannel[]> | null = null;
  async channelTypeBySaId(saId: string | number | null | undefined): Promise<string | undefined> {
    if (saId == null) return undefined;
    let list = this.cachedChannels(); // запускает фоновое обновление если кэш пуст/устарел
    // Если кэш холодный (первый запрос после рестарта) — дождаться уже стартовавшего fetch.
    // Для UI-виджетов «пусто» допустимо, для отправки фото нам нужна точность.
    if (!list.length && this.channelsInFlight) {
      try { list = await this.channelsInFlight; } catch { list = []; }
    }
    return list.find((c) => String(c.id) === String(saId))?.type;
  }

  /**
   * Кэш списка каналов Umnico (5 мин). КЛЮЧЕВОЕ: обновление идёт ТОЛЬКО в фоне — запрос
   * (загрузка «Диалогов» и т.п.) НИКОГДА не ждёт Umnico, а сразу получает то, что уже есть
   * в кэше (свежее/прошлое/пусто). Так медленный Umnico не может подвесить страницу вообще.
   *  - дедуп: одновременно идёт не более одного фонового обновления;
   *  - мягкая деградация: при сбое сохраняем прошлый список и коротко (30с) повторяем.
   * Тип канала — косметика (подпись «Умнико · Telegram»), поэтому «пусто до первой загрузки»
   * абсолютно допустимо и самоизлечивается за секунды.
   */
  private cachedChannels(): UmnicoChannel[] {
    const now = Date.now();
    const fresh = this.channelsCache && now - this.channelsCache.at <= 5 * 60_000;
    if (!fresh && !this.channelsInFlight) {
      this.channelsInFlight = this.listChannels()
        .then((list) => {
          if (list.length || !this.channelsCache) this.channelsCache = { at: Date.now(), list };
          else this.channelsCache = { at: Date.now() - 5 * 60_000 + 30_000, list: this.channelsCache.list };
          return this.channelsCache.list;
        })
        .catch(() => this.channelsCache?.list ?? [])
        .finally(() => {
          this.channelsInFlight = null;
        });
    }
    return this.channelsCache?.list ?? [];
  }

  /**
   * Кэшированный список каналов БЕЗ ожидания сети (обновляется в фоне) — для страниц, где
   * важнее скорость, чем свежесть (напр. конфиг воронки/«Заселение»). Не вешает страницу,
   * даже если Umnico недоступен; на холодном кэше вернёт пусто и догрузит в фоне.
   */
  channelsCached(): UmnicoChannel[] {
    return this.cachedChannels();
  }

  async getPublicConfig(): Promise<UmnicoPublicConfig> {
    const has = await this.hasToken();
    const channels = has ? await this.listChannels() : [];
    return { tokenSet: has, connected: has, channels };
  }

  /** Список зарегистрированных вебхуков (GET /v1.3/webhooks). */
  async listWebhooks(): Promise<UmnicoWebhookEntry[]> {
    const token = await this.token();
    if (!token) return [];
    try {
      const res = await fetch(`${this.base}/v1.3/webhooks`, { headers: this.authHeaders(token) });
      if (!res.ok) return [];
      const data = (await res.json()) as UmnicoWebhookEntry[];
      return Array.isArray(data) ? data : [];
    } catch (e) {
      this.logger.warn(`listWebhooks: ${(e as Error).message}`);
      return [];
    }
  }

  /**
   * Регистрирует наш URL вебхука в Umnico (в кабинете Umnico такой настройки нет —
   * только через API, POST /v1.3/webhooks). Всегда создаёт СВЕЖИЙ активный вебхук и
   * удаляет прежние с тем же URL: Umnico мог отключить старый (status 0) после
   * неудачных доставок (напр. когда сервер лежал) — тогда «просто оставить как есть»
   * означало бы навсегда выключенный вебхук и молчащие входящие. Пересоздание гарантирует
   * активный. Чужие вебхуки (другой URL) не трогаем. Лимит Umnico — 10 штук.
   */
  async registerWebhook(url: string, name = 'D H&A AI'): Promise<{ ok: boolean; message: string; id?: number }> {
    const token = await this.token();
    if (!token) return { ok: false, message: 'Не задан токен Umnico — сначала сохраните токен.' };
    const target = url.trim();
    if (!/^https:\/\//i.test(target)) return { ok: false, message: 'URL вебхука должен быть по HTTPS.' };
    try {
      // Umnico не даёт создать дубль на тот же URL («This server already exists»), поэтому:
      // если вебхук уже есть — включаем его (PUT status:1); если нет — создаём.
      const mine = (await this.listWebhooks()).find((w) => (w.url ?? '').trim() === target);
      if (mine) {
        const wasStatus = mine.status;
        const put = await fetch(`${this.base}/v1.3/webhooks/${mine.id}`, {
          method: 'PUT',
          headers: this.authHeaders(token),
          body: JSON.stringify({ status: 1 }),
        });
        if (!put.ok) {
          const d = await put.text().catch(() => '');
          return {
            ok: false,
            message: `Вебхук есть (id ${mine.id}, статус ${wasStatus ?? '?'}), но включить не удалось: ${put.status} ${d.slice(0, 150)}`,
          };
        }
        return {
          ok: true,
          message:
            wasStatus === 1
              ? `Вебхук уже был активен (id ${mine.id}, статус 1). Если входящие не идут — причина не в статусе.`
              : `Вебхук включён: id ${mine.id}, статус был ${wasStatus ?? '?'} → 1.`,
          id: mine.id,
        };
      }
      const res = await fetch(`${this.base}/v1.3/webhooks`, {
        method: 'POST',
        headers: this.authHeaders(token),
        body: JSON.stringify({ url: target, name }),
      });
      if (res.ok) {
        const created = (await res.json().catch(() => ({}))) as UmnicoWebhookEntry;
        return { ok: true, message: 'Вебхук зарегистрирован в Umnico (создан новый).', id: created.id };
      }
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'Токен отклонён (401/403).' };
      const detail = await res.text().catch(() => '');
      return { ok: false, message: `Umnico вернул ${res.status}: ${detail.slice(0, 200)}` };
    } catch (e) {
      return { ok: false, message: `Сеть/адрес недоступны: ${(e as Error).message}` };
    }
  }

  /** Проверка подключения: GET /v1.3/integrations. */
  async testConnection(token?: string): Promise<{ ok: boolean; message: string }> {
    const t = (token && token.trim()) || (await this.token());
    if (!t) return { ok: false, message: 'Не задан токен Umnico — введите его в поле выше.' };
    try {
      const res = await fetch(`${this.base}/v1.3/integrations`, { headers: this.authHeaders(t) });
      if (res.ok) {
        const data = (await res.json().catch(() => [])) as unknown[];
        const n = Array.isArray(data) ? data.length : 0;
        return { ok: true, message: `Подключение успешно: каналов в Umnico — ${n}.` };
      }
      if (res.status === 401 || res.status === 403) return { ok: false, message: 'Токен отклонён (401/403) — проверьте API-токен в настройках Umnico.' };
      return { ok: false, message: `Umnico вернул статус ${res.status}.` };
    } catch (e) {
      return { ok: false, message: `Сеть/адрес недоступны: ${(e as Error).message}` };
    }
  }

  /**
   * id оператора аккаунта Umnico (GET /v1.3/managers) — обязателен как отправитель
   * при send (userId). Кэшируем: операторы меняются редко, сбрасывается перезапуском.
   * Предпочитаем владельца (role=owner), затем подтверждённого, затем любого.
   */
  private cachedManagerId?: number;
  async managerUserId(): Promise<number | undefined> {
    if (this.cachedManagerId != null) return this.cachedManagerId;
    const token = await this.token();
    if (!token) return undefined;
    try {
      const res = await fetch(`${this.base}/v1.3/managers`, {
        headers: this.authHeaders(token),
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) return undefined;
      const data = (await res.json().catch(() => [])) as { id: number; role?: string; confirmed?: boolean }[];
      const arr = Array.isArray(data) ? data : [];
      const chosen = arr.find((m) => m.role === 'owner') ?? arr.find((m) => m.confirmed) ?? arr[0];
      this.cachedManagerId = chosen?.id;
      return this.cachedManagerId;
    } catch (e) {
      this.logger.warn(`managers: ${(e as Error).message}`);
      return undefined;
    }
  }

  /** Отправка сообщения: POST /v1.3/messaging/<leadId>/send. */
  async sendMessage(
    target: { leadId: string; source?: string; userId?: string; saId?: string },
    text: string,
  ): Promise<void> {
    const token = await this.token();
    if (!token || !target.leadId) {
      this.logger.warn('Umnico: нет токена или leadId — сообщение не отправлено.');
      return;
    }
    // Umnico ждёт: source (source.realId канала) + userId — id ОПЕРАТORA аккаунта
    // (не клиента! иначе 422 «User X doesn't exist for this account»). saId опц.
    const body: Record<string, unknown> = { message: { text } };
    if (target.source) body.source = target.source;
    const senderId = await this.managerUserId();
    if (senderId != null) body.userId = senderId;
    else this.logger.error('Umnico: не найден оператор аккаунта (GET /managers) — userId обязателен, ответ не уйдёт.');
    if (target.saId) body.saId = /^\d+$/.test(target.saId) ? Number(target.saId) : target.saId;
    const res = await fetch(`${this.base}/v1.3/messaging/${encodeURIComponent(target.leadId)}/send`, {
      method: 'POST',
      headers: this.authHeaders(token),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    }).catch((err: unknown) => {
      this.logger.error(`Umnico send сеть: ${(err as Error).message}`);
      return null;
    });
    if (res && !res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Umnico send ${res.status}: ${detail.slice(0, 300)}`);
    }
  }

  /**
   * «Написать первым»: POST /v1.3/messaging/post — инициировать диалог по номеру
   * телефона через выбранную интеграцию (saId = id канала из GET /integrations).
   * Создаёт лид, если его не было (иначе продолжает существующий). Работает для
   * WhatsApp / Telegram Personal / Email; у Umnico действуют суточные лимиты на
   * новые контакты. Возвращает ok + leadId (если Umnico его вернул) либо ошибку.
   * ВНИМАНИЕ: холодная рассылка через личный аккаунт рискует блокировкой — по
   * рекомендациям Umnico. Отправляем только по явному выбору канала на этапе.
   */
  async reachOutFirst(
    saId: number,
    destination: string,
    text: string,
    customId?: string,
  ): Promise<{ ok: boolean; leadId?: string; error?: string }> {
    const token = await this.token();
    if (!token) return { ok: false, error: 'нет токена Umnico' };
    const dest = destination.replace(/\D/g, ''); // международный формат без «+»
    if (!dest) return { ok: false, error: 'пустой номер' };
    if (!Number.isFinite(saId)) return { ok: false, error: 'неверный saId' };
    const body: Record<string, unknown> = { message: { text }, destination: dest, saId };
    if (customId) body.customId = customId;
    const res = await fetch(`${this.base}/v1.3/messaging/post`, {
      method: 'POST',
      headers: this.authHeaders(token),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    }).catch((err: unknown) => {
      this.logger.error(`Umnico reachOut сеть: ${(err as Error).message}`);
      return null;
    });
    if (!res) return { ok: false, error: 'сеть' };
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      this.logger.error(`Umnico reachOut ${res.status}: ${detail.slice(0, 300)}`);
      return { ok: false, error: `${res.status}: ${detail.slice(0, 160)}` };
    }
    const data = (await res.json().catch(() => ({}))) as { leadId?: number | string };
    return { ok: true, leadId: data.leadId != null ? String(data.leadId) : undefined };
  }

  /**
   * Отправка сообщения с вложением (фото/видео/файл). Формат ПОДТВЕРЖДЁН по реальному
   * исходящему MAX-вебхуку: `message.attachments[{type,url}]` (без `name` — Umnico его не
   * принимал/не эхоил, лишнее поле могло ронять запрос в фолбэк). type: photo/video/file.
   * Результат отправки пишем в диагностику (`captureSend`) — видно, ушло нативно или упало.
   * При ошибке — фолбэк ссылкой текстом, чтобы гость гарантированно получил файл (#6).
   */
  async sendAttachment(
    target: { leadId: string; source?: string; userId?: string; saId?: string },
    media: { url: string; kind: 'IMAGE' | 'VIDEO' | 'FILE'; name: string; caption?: string },
  ): Promise<void> {
    const token = await this.token();
    if (!token || !target.leadId) {
      this.logger.warn('Umnico: нет токена или leadId — вложение не отправлено.');
      return;
    }
    const type = media.kind === 'IMAGE' ? 'photo' : media.kind === 'VIDEO' ? 'video' : 'file';
    // Имя файла (для type=file) не теряем — кладём в подпись, т.к. в объект вложения Umnico
    // принимает только {type,url}. Для фото/видео имя не нужно.
    const caption = media.kind === 'FILE' && media.name
      ? [media.caption, media.name].filter(Boolean).join(' — ')
      : media.caption ?? '';
    const body: Record<string, unknown> = {
      message: {
        text: caption,
        attachments: [{ type, url: media.url }],
      },
    };
    if (target.source) body.source = target.source;
    const senderId = await this.managerUserId();
    if (senderId != null) body.userId = senderId;
    if (target.saId) body.saId = /^\d+$/.test(target.saId) ? Number(target.saId) : target.saId;
    const res = await fetch(`${this.base}/v1.3/messaging/${encodeURIComponent(target.leadId)}/send`, {
      method: 'POST',
      headers: this.authHeaders(token),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    }).catch((err: unknown) => {
      this.logger.error(`Umnico attachment сеть: ${(err as Error).message}`);
      return null;
    });
    const detail = res ? await res.text().catch(() => '') : 'network';
    // Диагностика #6: фиксируем запрос+ответ, чтобы точно видеть, ушло нативно или в фолбэк.
    void this.captureSend({
      at: new Date().toISOString(),
      leadId: target.leadId,
      body,
      status: res?.status ?? 'network',
      response: String(detail).slice(0, 300),
    });
    if (!res || !res.ok) {
      this.logger.error(`Umnico attachment ${res?.status ?? '—'}: ${String(detail).slice(0, 300)} — фолбэк ссылкой`);
      // Гарантируем доставку: отправляем подпись + прямую ссылку обычным сообщением.
      await this.sendMessage(target, media.caption ? `${media.caption}\n${media.url}` : media.url);
    }
  }

  private decrypt(enc: string | null): string {
    if (!enc) return '';
    try {
      return this.crypto.decryptPii(enc);
    } catch (e) {
      this.logger.error(`Не удалось расшифровать токен Umnico: ${(e as Error).message}`);
      return '';
    }
  }
}
