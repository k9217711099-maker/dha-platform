import { Injectable, Logger } from '@nestjs/common';
import { AiActorKind, AiChannel, AiConversationStatus, AiMessageRole } from '@prisma/client';
import { GuestAgentService } from '../agents/guest-agent.service.js';
import { ConversationService } from '../conversations/conversation.service.js';
import { UmnicoConfigService } from '../../integrations/umnico/umnico-config.service.js';
import { TenantService } from '../../pms/tenant/tenant.service.js';
import { ChannelToggleService } from './channel-toggle.service.js';

/** Входящее из Umnico (упрощённо): обращение + текст + адрес для ответа. */
export interface UmnicoIncoming {
  leadId: string;
  source?: string;
  userId?: string;
  saId?: string;
  /** Телефон гостя (если канал его отдаёт) — для привязки диалога к профилю (#8). */
  phone?: string;
  /** Тип подканала Umnico (whatsapp/telegram/vk/avito…) — откуда пишет гость (#14). */
  sourceType?: string;
  /** Фото профиля гостя из канала (если отдаётся) — показываем оператору в диалоге. */
  avatar?: string;
  text: string;
}

/**
 * Оркестратор канала Umnico: входящее сообщение (из вебхука message.incoming) →
 * гостевой AI-агент → ответ обратно через Umnico (POST /messaging/<leadId>/send).
 * Диалог привязывается к обращению Umnico (leadId) через externalId. По аналогии
 * с MaxAgentService. Umnico покрывает WhatsApp/Telegram/VK/Avito одним каналом.
 */
@Injectable()
export class UmnicoAgentService {
  private readonly logger = new Logger('UmnicoAgent');

  constructor(
    private readonly guestAgent: GuestAgentService,
    private readonly conversations: ConversationService,
    private readonly umnico: UmnicoConfigService,
    private readonly tenant: TenantService,
    private readonly toggle: ChannelToggleService,
  ) {}

  /**
   * «Написать гостю первым» из карточки брони (#12): инициируем диалог по телефону через
   * выбранный подключённый канал Umnico (saId) и логируем исходящее в диалог гостя, чтобы
   * оно было видно в истории переписки. Диалог переводим в ESCALATED — оператор ведёт вручную.
   */
  async reachOut(input: {
    guestId?: string;
    phone: string;
    saId: number;
    text: string;
  }): Promise<{ ok: boolean; conversationId?: string; error?: string }> {
    const tenantId = await this.tenant.getDefaultTenantId();
    const r = await this.umnico.reachOutFirst(input.saId, input.phone, input.text);
    if (!r.ok) return { ok: false, error: r.error };
    let conversationId: string | undefined;
    try {
      // Логируем исходящее в диалог ВСЕГДА, а не только когда Umnico вернул leadId —
      // иначе история переписки в карточке брони оставалась пустой (#12). Порядок поиска:
      // по leadId (если есть) → последний UMNICO-диалог гостя → создаём новый.
      let convo = r.leadId
        ? await this.conversations.findByExternal(tenantId, AiChannel.UMNICO, r.leadId)
        : null;
      if (!convo && input.guestId) {
        convo = await this.conversations.findGuestChannel(tenantId, input.guestId, AiChannel.UMNICO);
      }
      if (!convo) {
        convo = await this.conversations.create({
          tenantId,
          channel: AiChannel.UMNICO,
          actorKind: AiActorKind.GUEST,
          guestId: input.guestId,
        });
      }
      conversationId = convo.id;
      // externalId (leadId) выставляем, если он есть, а у диалога ещё не задан — чтобы
      // входящие ответы гостя приклеились к этому же диалогу.
      if (r.leadId && !convo.externalId) await this.conversations.setExternalId(conversationId, r.leadId);
      const prevMeta = (convo.channelMeta ?? {}) as { avatar?: string | null; sourceType?: string | null };
      await this.conversations.setChannelMeta(conversationId, {
        saId: String(input.saId),
        phone: input.phone,
        sourceType: prevMeta.sourceType ?? null,
        avatar: prevMeta.avatar ?? null,
      });
      if (input.guestId) await this.conversations.setGuestId(conversationId, input.guestId);
      await this.conversations.addMessage(conversationId, {
        role: AiMessageRole.STAFF,
        content: input.text,
      });
      await this.conversations.setStatus(conversationId, AiConversationStatus.ESCALATED);
    } catch (e) {
      // Сообщение гостю уже ушло — не роняем ответ из-за проблем логирования.
      this.logger.error(`reachOut: сообщение ушло, но лог в диалог не удался: ${(e as Error).message}`);
    }
    return { ok: true, conversationId };
  }

  async handleIncoming(msg: UmnicoIncoming): Promise<void> {
    const text = msg.text?.trim();
    if (!msg.leadId || !text) return;
    try {
      // Канал Umnico выключен тумблером в админке — входящие игнорируем.
      if (!(await this.toggle.isChannelEnabledFor(AiChannel.UMNICO))) return;
      const tenantId = await this.tenant.getDefaultTenantId();
      const existing = await this.conversations.findByExternal(tenantId, AiChannel.UMNICO, msg.leadId);
      const res = await this.guestAgent.handle({
        conversationId: existing?.id,
        tenantId,
        channel: AiChannel.UMNICO,
        text,
      });
      if (!existing) await this.conversations.setExternalId(res.conversationId, msg.leadId);
      // Подканал (#14): вебхук не всегда отдаёт source.type, но saId есть всегда —
      // добираем тип канала (whatsapp/telegram/…) из списка подключённых интеграций.
      const sourceType = msg.sourceType ?? (await this.umnico.channelTypeBySaId(msg.saId));
      // Прежние значения: телефон/фото/подканал канал часто отдаёт лишь в первом сообщении,
      // поэтому setChannelMeta (полная замена) не должен их затирать — сохраняем ранее известные.
      const prev = (existing?.channelMeta ?? {}) as {
        phone?: string | null;
        sourceType?: string | null;
        avatar?: string | null;
      };
      // Сохраняем адрес ответа (source/userId/saId) — без него оператор не сможет
      // ответить в Umnico из инбокса (в leadId этих полей нет, а они обязательны).
      // Телефон и фото гостя кладём сюда же — оператор видит их в инбоксе (#8/#14).
      await this.conversations.setChannelMeta(res.conversationId, {
        source: msg.source ?? null,
        userId: msg.userId ?? null,
        saId: msg.saId ?? null,
        phone: msg.phone ?? prev.phone ?? null,
        sourceType: sourceType ?? prev.sourceType ?? null,
        avatar: msg.avatar ?? prev.avatar ?? null,
      });
      // Подтягиваем профиль гостя по номеру телефона (#8): если диалог ещё не привязан
      // к гостю, а телефон совпал с профилем — привязываем (в ленте появятся ФИО/профиль).
      if (msg.phone && !existing?.guestId) {
        const guestId = await this.conversations.findGuestIdByPhone(tenantId, msg.phone);
        if (guestId) await this.conversations.setGuestId(res.conversationId, guestId);
      }
      // Авто-ответ в мессенджер шлём ТОЛЬКО когда отвечает бот. При эскалации/выключенном
      // AI молчим — иначе гость получал бы «администратор скоро ответит» на каждое сообщение;
      // оператор ответит вручную из инбокса (OperatorInboxService → dispatchToChannel).
      if (!res.escalated && res.reply?.trim()) {
        await this.umnico.sendMessage(
          { leadId: msg.leadId, source: msg.source, userId: msg.userId, saId: msg.saId },
          res.reply,
        );
      }
    } catch (err) {
      this.logger.error(`Ошибка обработки входящего: ${(err as Error).message}`);
    }
  }
}
