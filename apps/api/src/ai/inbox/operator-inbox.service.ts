import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiChannel, AiConversationStatus, AiMessageRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { Env } from '../../config/env.schema.js';
import { ConversationService } from '../conversations/conversation.service.js';
import { AiDirectoryService } from '../directory/ai-directory.service.js';
import { SettingsService } from '../../common/settings/settings.service.js';
import { AttachmentStorageService } from '../../staff-chat/attachment-storage.service.js';
import { TelegramPort } from '../../integrations/telegram/telegram.port.js';
import { MaxPort } from '../../integrations/max/max.port.js';
import { UmnicoConfigService } from '../../integrations/umnico/umnico-config.service.js';

/** Быстрый шаблон ответа оператора (вставляется по «/» в ленте эскалаций). */
export interface ReplyTemplate {
  id: string;
  title: string;
  text: string;
}
const TEMPLATES_KEY = 'ai.inbox.reply_templates';

/**
 * Лента эскалаций (operator inbox, §4.7): оператор видит переданные человеку
 * диалоги, читает историю, отвечает гостю. Ответ доставляется в канал гостя:
 * мессенджеры (Telegram/MAX/Umnico) — сразу через их API; web/app — гость забирает
 * через GET /ai/guest/conversation/:id. Замыкает цикл «AI → человек».
 */
@Injectable()
export class OperatorInboxService {
  private readonly logger = new Logger('OperatorInbox');

  constructor(
    private readonly conversations: ConversationService,
    private readonly directory: AiDirectoryService,
    private readonly settings: SettingsService,
    private readonly telegram: TelegramPort,
    private readonly max: MaxPort,
    private readonly umnico: UmnicoConfigService,
    private readonly config: ConfigService<Env, true>,
    private readonly storage: AttachmentStorageService,
  ) {}

  /**
   * Абсолютный URL загруженного файла (API отдаёт `/uploads` статикой). Origin выводим из
   * GUEST_PORTAL_BASE_URL так же, как фронт: `api.<домен>` в проде, `:3001` локально/по IP.
   */
  private publicFileUrl(path: string): string {
    const portal = this.config.get('GUEST_PORTAL_BASE_URL', { infer: true }) ?? 'http://localhost:3000';
    let origin = 'http://localhost:3001';
    try {
      const u = new URL(portal);
      if (u.hostname === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname)) {
        origin = `${u.protocol}//${u.hostname}:3001`;
      } else {
        origin = `${u.protocol}//api.${u.hostname.replace(/^(www|admin)\./, '')}`;
      }
    } catch {
      /* fallback на localhost */
    }
    return `${origin}${path}`;
  }

  /**
   * Ответ гостю файлом/фото (#5/#10). Файл сохраняется, показывается в ленте (картинка —
   * маркером [img], рисуется как <img>) и уходит прямой ссылкой в канал гостя (мессенджеры
   * дают превью по URL; web/app гость забирает из истории). Опциональная подпись — вместе.
   */
  async replyAttachment(
    id: string,
    operatorId: string,
    file: Express.Multer.File,
    caption?: string,
  ): Promise<{ ok: true }> {
    const convo = await this.conversations.get(id);
    if (!convo) throw new NotFoundException('Диалог не найден');
    const saved = await this.storage.save(file);
    const url = this.publicFileUrl(saved.url);
    const cap = caption?.trim();
    const kind: 'IMAGE' | 'VIDEO' | 'FILE' = file.mimetype.startsWith('image/')
      ? 'IMAGE'
      : file.mimetype.startsWith('video/')
        ? 'VIDEO'
        : 'FILE';
    const marker = kind === 'IMAGE' ? `[img]${url}` : `[файл: ${saved.name}]\n${url}`;
    const feed = cap ? `${cap}\n${marker}` : marker;
    // Вмешался человек — переводим бота в ESCALATED, чтобы он замолчал (как в reply()).
    if (convo.status === AiConversationStatus.BOT) {
      await this.conversations.setStatus(id, AiConversationStatus.ESCALATED);
    }
    await this.conversations.assignOperator(id, operatorId);
    await this.conversations.addMessage(id, { role: AiMessageRole.STAFF, content: feed });
    await this.dispatchMediaToChannel(convo, { url, kind, name: saved.name, caption: cap });
    return { ok: true };
  }

  /**
   * Доставка медиа в канал гостя нативно (#5): Telegram — sendPhoto/sendVideo/sendDocument;
   * Umnico — attachments (с фолбэком ссылкой); web/app — гость забирает из истории (в ленте
   * [img]); MAX — пока ссылкой. При сбое канала — общий фолбэк ссылкой, чтобы файл дошёл.
   */
  private async dispatchMediaToChannel(
    convo: { channel: AiChannel; externalId: string | null; channelMeta: unknown },
    media: { url: string; kind: 'IMAGE' | 'VIDEO' | 'FILE'; name: string; caption?: string },
  ): Promise<void> {
    const to = convo.externalId;
    const asText = media.caption ? `${media.caption}\n${media.url}` : media.url;
    try {
      switch (convo.channel) {
        case AiChannel.TELEGRAM:
          if (to) await this.telegram.sendMedia(to, media);
          break;
        case AiChannel.UMNICO: {
          if (!to) break;
          const meta = (convo.channelMeta ?? {}) as {
            source?: string | null;
            userId?: string | null;
            saId?: string | null;
          };
          await this.umnico.sendAttachment(
            { leadId: to, source: meta.source ?? undefined, userId: meta.userId ?? undefined, saId: meta.saId ?? undefined },
            media,
          );
          break;
        }
        case AiChannel.MAX:
          if (to) await this.max.sendMessage(to, asText); // нативное медиа MAX — позже
          break;
        case AiChannel.WEB:
        case AiChannel.APP:
          break; // гость забирает из истории (GET), в ленте — [img]
        default:
          this.logger.warn(`Медиа-ответ в канал ${convo.channel} не доставлен: обратная отправка не подключена`);
      }
    } catch (e) {
      this.logger.error(`Медиа в ${convo.channel} не ушло: ${(e as Error).message} — фолбэк ссылкой`);
      if (to) await this.dispatchToChannel(convo, asText).catch(() => undefined);
    }
  }

  /** Быстрые шаблоны ответа (§4.7, «/»). Хранятся в Setting как JSON-массив. */
  async getTemplates(): Promise<ReplyTemplate[]> {
    const raw = await this.settings.get(TEMPLATES_KEY);
    if (!raw) return [];
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? (v as ReplyTemplate[]) : [];
    } catch {
      return [];
    }
  }

  /** Сохранить список шаблонов (полная замена). Чистим/ограничиваем ввод. */
  async setTemplates(list: Array<Partial<ReplyTemplate>>): Promise<ReplyTemplate[]> {
    const clean: ReplyTemplate[] = (Array.isArray(list) ? list : [])
      .filter((t) => t && typeof t.text === 'string' && t.text.trim())
      .slice(0, 50)
      .map((t) => ({
        id: t.id || randomUUID(),
        title: (t.title ?? '').trim().slice(0, 80),
        text: (t.text ?? '').trim().slice(0, 4000),
      }));
    await this.settings.set(TEMPLATES_KEY, JSON.stringify(clean));
    return clean;
  }

  /**
   * Очередь эскалаций: диалоги ESCALATED с превью последнего сообщения и именами
   * (та же форма, что «Все диалоги» — чтобы в ленте был виден текст последнего сообщения).
   */
  async list(tenantId: string) {
    return this.listAll(tenantId, { status: AiConversationStatus.ESCALATED });
  }

  /**
   * Все гостевые диалоги (мониторинг), не только эскалированные. Фильтры по
   * статусу/каналу опциональны; каждая строка — с превью последнего сообщения и
   * именами гостя/оператора.
   */
  async listAll(
    tenantId: string,
    opts: { status?: AiConversationStatus; channel?: AiChannel } = {},
  ) {
    const rows = await this.conversations.listGuestConversations(tenantId, opts);
    const [guests, operators] = await Promise.all([
      this.directory.guestProfiles(rows.map((r) => r.guestId)),
      this.directory.operators(rows.map((r) => r.operatorId)),
    ]);
    // #14: у старых Umnico-диалогов sourceType не проставлен — добираем тип канала по saId
    // (кэш 5 мин, поэтому уникальные saId резолвятся дёшево).
    const needType = [...new Set(rows.filter((r) => !r.subChannel && r.saId).map((r) => r.saId!))];
    const typeBySaId = new Map<string, string | undefined>();
    for (const said of needType) typeBySaId.set(said, await this.umnico.channelTypeBySaId(said));
    return rows.map(({ metaPhone, saId, ...r }) => {
      const g = r.guestId ? guests.get(r.guestId) : undefined;
      return {
        ...r,
        guestName: g?.name || null,
        // Телефон: из профиля гостя (если сопоставлен), иначе — из канала (#8).
        guestPhone: g?.phone ?? metaPhone ?? null,
        subChannel: r.subChannel ?? (saId ? typeBySaId.get(saId) ?? null : null),
        operatorName: (r.operatorId && operators.get(r.operatorId)) || null,
      };
    });
  }

  /** Число непрочитанных эскалированных диалогов — для бейджа в сайдборе (#1). */
  async unreadCount(tenantId: string): Promise<{ count: number }> {
    const rows = await this.conversations.listGuestConversations(tenantId, {
      status: AiConversationStatus.ESCALATED,
    });
    return { count: rows.filter((r) => r.unread).length };
  }

  async thread(id: string) {
    const convo = await this.conversations.get(id);
    if (!convo) throw new NotFoundException('Диалог не найден');
    // Оператор открыл диалог → отмечаем прочитанным (сбрасывает «непрочитано»/бейдж).
    // Не блокируем ответ и не роняем его из-за сбоя отметки.
    void this.conversations.setOperatorRead(id).catch(() => undefined);
    const [messages, guests, operators] = await Promise.all([
      this.conversations.threadView(id, { includeSystem: true }), // операторская лента видит SYSTEM-заметки (лог делегирования)
      this.directory.guestProfiles([convo.guestId]),
      this.directory.operators([convo.operatorId]),
    ]);
    // Телефон/фото гостя из мессенджера (напр. Umnico) храним в channelMeta — показываем
    // оператору даже если профиль ещё не сопоставлен (#8). sourceType — подканал (#14).
    const meta = (convo.channelMeta ?? {}) as {
      phone?: string | null;
      sourceType?: string | null;
      avatar?: string | null;
      saId?: string | null;
    };
    // #14: старым диалогам добираем тип канала по saId (кэшируется).
    const subChannel = meta.sourceType ?? (meta.saId ? (await this.umnico.channelTypeBySaId(meta.saId)) ?? null : null);
    const g = convo.guestId ? guests.get(convo.guestId) : undefined;
    return {
      conversation: {
        id: convo.id,
        channel: convo.channel,
        status: convo.status,
        title: convo.title,
        subChannel,
        guestId: convo.guestId,
        guestName: g?.name || null,
        // Телефон: из профиля гостя (надёжнее), иначе — из канала (#8).
        guestPhone: g?.phone ?? meta.phone ?? null,
        avatar: meta.avatar ?? null,
        operatorId: convo.operatorId,
        operatorName: (convo.operatorId && operators.get(convo.operatorId)) || null,
        createdAt: convo.createdAt,
      },
      messages,
    };
  }

  assign(id: string, operatorId: string) {
    return this.conversations.assignOperator(id, operatorId);
  }

  /** Переименовать диалог (метка оператора §4.7). Пустая строка → сброс к дефолту. */
  async rename(id: string, title: string | null): Promise<{ ok: true }> {
    const convo = await this.conversations.get(id);
    if (!convo) throw new NotFoundException('Диалог не найден');
    await this.conversations.setTitle(id, title);
    return { ok: true };
  }

  async reply(id: string, operatorId: string, text: string): Promise<{ ok: true }> {
    const convo = await this.conversations.get(id);
    if (!convo) throw new NotFoundException('Диалог не найден');
    // Человек вмешался в диалог, который вёл бот → переводим в ESCALATED, чтобы агент
    // замолчал и не отвечал параллельно с оператором (guest-agent молчит при ESCALATED).
    if (convo.status === AiConversationStatus.BOT) {
      await this.conversations.setStatus(id, AiConversationStatus.ESCALATED);
    }
    await this.conversations.assignOperator(id, operatorId);
    await this.conversations.addMessage(id, { role: AiMessageRole.STAFF, content: text });
    await this.dispatchToChannel(convo, text);
    return { ok: true };
  }

  /**
   * Доставка ответа оператора в канал гостя. Мессенджеры — через их sendMessage;
   * web/app гость забирает опросом GET, поэтому им ничего не шлём. Ошибку канала
   * логируем, но не роняем ответ (сообщение уже сохранено в диалоге).
   */
  private async dispatchToChannel(
    convo: { channel: AiChannel; externalId: string | null; channelMeta: unknown },
    text: string,
  ): Promise<void> {
    const to = convo.externalId;
    try {
      switch (convo.channel) {
        case AiChannel.TELEGRAM:
          if (to) await this.telegram.sendMessage(to, text);
          break;
        case AiChannel.MAX:
          if (to) await this.max.sendMessage(to, text);
          break;
        case AiChannel.UMNICO: {
          if (!to) break;
          const meta = (convo.channelMeta ?? {}) as {
            source?: string | null;
            userId?: string | null;
            saId?: string | null;
          };
          await this.umnico.sendMessage(
            {
              leadId: to,
              source: meta.source ?? undefined,
              userId: meta.userId ?? undefined,
              saId: meta.saId ?? undefined,
            },
            text,
          );
          break;
        }
        case AiChannel.WEB:
        case AiChannel.APP:
          break; // гость забирает ответ опросом GET /ai/guest/conversation/:id
        default:
          // WHATSAPP / TELEGRAM_DIRECT / ADMIN — обратная отправка пока не подключена.
          this.logger.warn(
            `Ответ оператора в канал ${convo.channel} не доставлен: канал не подключён к обратной отправке`,
          );
      }
    } catch (e) {
      this.logger.error(`Не удалось доставить ответ оператора в ${convo.channel}: ${(e as Error).message}`);
    }
  }

  async close(id: string): Promise<{ ok: true }> {
    await this.conversations.setStatus(id, AiConversationStatus.CLOSED);
    return { ok: true };
  }

  /** Сотрудники — цели делегирования (§4.8). */
  operators(tenantId: string) {
    return this.directory.listOperators(tenantId);
  }

  /**
   * Передать диалог другому сотруднику с комментарием-контекстом (§4.8). История
   * сохраняется; у нового ответственного диалог появляется в его ленте, гость
   * продолжает в том же канале. Факт передачи пишем SYSTEM-заметкой (виден операторам,
   * не гостю) — лог «кто→кому→когда→причина» для аудита/метрик.
   */
  async delegate(
    id: string,
    fromOperatorId: string,
    toOperatorId: string,
    note?: string,
  ): Promise<{ ok: true }> {
    const convo = await this.conversations.get(id);
    if (!convo) throw new NotFoundException('Диалог не найден');
    const names = await this.directory.operators([fromOperatorId, toOperatorId]);
    const fromName = names.get(fromOperatorId) ?? 'оператор';
    const toName = names.get(toOperatorId) ?? 'коллега';
    await this.conversations.assignOperator(id, toOperatorId);
    const log = `Диалог передан: ${fromName} → ${toName}${note ? `. Комментарий: ${note}` : ''}`;
    await this.conversations.addMessage(id, { role: AiMessageRole.SYSTEM, content: log });
    return { ok: true };
  }
}
