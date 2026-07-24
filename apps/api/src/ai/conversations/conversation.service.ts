import { Injectable } from '@nestjs/common';
import { AiActorKind, AiChannel, AiConversationStatus, AiMessageRole, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { InboxEvents } from '../inbox/inbox.events.js';
import type { LlmMessage, LlmRole, LlmToolCall } from '../llm/llm.types.js';

export interface CreateConversationInput {
  tenantId: string;
  channel: AiChannel;
  actorKind: AiActorKind;
  guestId?: string;
  employeeId?: string;
}

export interface AddMessageInput {
  role: AiMessageRole;
  content: string;
  toolName?: string;
  toolCallId?: string;
  toolCalls?: LlmToolCall[];
  tokensIn?: number;
  tokensOut?: number;
  model?: string;
}

export interface AddToolAuditInput {
  tenantId?: string;
  conversationId?: string;
  actorKind: AiActorKind;
  guestId?: string;
  employeeId?: string;
  toolName: string;
  argsRedacted?: Record<string, unknown>;
  allowed?: boolean;
  isError?: boolean;
  result?: string;
}

const ROLE_TO_LLM: Record<AiMessageRole, LlmRole> = {
  USER: 'user',
  ASSISTANT: 'assistant',
  STAFF: 'assistant', // ответ оператора — для модели как assistant-ход, если диалог возобновят
  TOOL: 'tool',
  SYSTEM: 'system',
};

/** Персистентность диалогов AI (история в нашей БД — API модели stateless, §4.9). */
@Injectable()
export class ConversationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inboxEvents: InboxEvents,
  ) {}

  create(input: CreateConversationInput) {
    return this.prisma.aiConversation.create({
      data: {
        tenantId: input.tenantId,
        channel: input.channel,
        actorKind: input.actorKind,
        guestId: input.guestId,
        employeeId: input.employeeId,
      },
    });
  }

  get(id: string) {
    return this.prisma.aiConversation.findUnique({ where: { id } });
  }

  /** Найти диалог по внешнему ID чата (напр. Telegram chat id). */
  findByExternal(tenantId: string, channel: AiChannel, externalId: string) {
    return this.prisma.aiConversation.findFirst({ where: { tenantId, channel, externalId } });
  }

  /** Последний диалог гостя в данном канале — для дозаписи исходящего без leadId (#12). */
  findGuestChannel(tenantId: string, guestId: string, channel: AiChannel) {
    return this.prisma.aiConversation.findFirst({
      where: { tenantId, guestId, channel },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Диалог для СЛИЯНИЯ «1 гость + 1 подканал = 1 чат»: ищем существующий диалог того же
   * человека в том же подканале (Telegram/WhatsApp/…), чтобы не плодить по одному на каждый
   * leadId Umnico. Идентичность — по guestId (если сопоставлен) ИЛИ по customerId Umnico;
   * подканал — по channelMeta.sourceType. Берём самый свежий.
   */
  async findMergeTarget(
    tenantId: string,
    opts: { guestId?: string | null; customerId?: string | null; subChannel?: string | null },
  ) {
    const { guestId, customerId, subChannel } = opts;
    if (!guestId && !customerId) return null;
    const idOr: Prisma.AiConversationWhereInput[] = [];
    if (guestId) idOr.push({ guestId });
    if (customerId) idOr.push({ channelMeta: { path: ['customerId'], equals: customerId } });
    const rows = await this.prisma.aiConversation.findMany({
      where: { tenantId, channel: AiChannel.UMNICO, OR: idOr },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    // Совпадение подканала: если он известен — берём тот же (иначе — любой самый свежий).
    if (subChannel) {
      const same = rows.find((r) => (r.channelMeta as { sourceType?: string } | null)?.sourceType === subChannel);
      if (same) return same;
    }
    return rows[0] ?? null;
  }

  setExternalId(id: string, externalId: string) {
    return this.prisma.aiConversation.update({ where: { id }, data: { externalId } });
  }

  /**
   * Сохранить данные маршрутизации канала (напр. Umnico source/userId/saId) — нужны,
   * чтобы оператор мог ответить в канал из инбокса (в leadId их нет). Обновляем на
   * каждое входящее, т.к. значения могут меняться (напр. новый source по обращению).
   */
  setChannelMeta(id: string, meta: Prisma.InputJsonValue) {
    return this.prisma.aiConversation.update({ where: { id }, data: { channelMeta: meta } });
  }

  /** Привязать существующий диалог к гостю (напр. после Telegram deep-link §13). */
  setGuestId(id: string, guestId: string) {
    return this.prisma.aiConversation.update({ where: { id }, data: { guestId } });
  }

  /** Отметить диалог прочитанным оператором (сбрасывает «непрочитано» в ленте §4.7). */
  setOperatorRead(id: string) {
    this.inboxEvents.publish('read'); // realtime-бейдж (#1)
    return this.prisma.aiConversation.update({
      where: { id },
      data: { operatorReadAt: new Date() },
    });
  }

  /** Переименовать диалог (метка оператора в ленте эскалаций §4.7). Пусто → сброс к дефолту. */
  setTitle(id: string, title: string | null) {
    const t = title?.trim();
    return this.prisma.aiConversation.update({ where: { id }, data: { title: t || null } });
  }

  /**
   * Найти гостя тенанта по номеру телефона — для авто-привязки диалога из мессенджера
   * к профилю (#8, «подтянуть профиль по номеру»). Матч по последним 10 цифрам, т.к.
   * форматы различаются (+7…/8…/9…, с пробелами/скобками). Возвращает id первого
   * совпадения или null. Вызывается редко (при первом входящем нового обращения).
   */
  async findGuestIdByPhone(tenantId: string, phone: string): Promise<string | null> {
    const tail = phone.replace(/\D/g, '').slice(-10);
    if (tail.length < 10) return null;
    // Ограничение: берём не более 3000 гостей — защита от полного скана на больших тенантах.
    // phone @unique — один уникальный индекс на всю таблицу, но LIKE '%tail' его не использует.
    // Настоящий фикс — нормализованное поле phoneDigits + индекс; это — быстрый гвард.
    const rows = await this.prisma.guest.findMany({
      where: { tenantId, phone: { not: null } },
      select: { id: true, phone: true },
      take: 3000,
    });
    const hit = rows.find((r) => (r.phone ?? '').replace(/\D/g, '').endsWith(tail));
    return hit?.id ?? null;
  }

  /**
   * Сообщения диалога для показа. Гостю — только user/ai/staff (по умолчанию).
   * Оператору (`includeSystem`) — плюс SYSTEM-заметки (напр. лог делегирования §4.8),
   * которые гость не видит. TOOL-сообщения скрыты всегда.
   */
  async threadView(
    conversationId: string,
    opts: { includeSystem?: boolean } = {},
  ): Promise<Array<{ role: 'user' | 'ai' | 'staff' | 'system'; text: string; createdAt: Date }>> {
    const roles: AiMessageRole[] = [
      AiMessageRole.USER,
      AiMessageRole.ASSISTANT,
      AiMessageRole.STAFF,
    ];
    if (opts.includeSystem) roles.push(AiMessageRole.SYSTEM);
    // Лимит: берём ПОСЛЕДНИЕ 500 сообщений (desc + take), затем разворачиваем в хронологию.
    // Без лимита активный диалог (сотни сообщений) отвечал дольше 5-сек опроса → запросы
    // наслаивались и забивали лимит соединений браузера («Load failed»). 500 для чат-вью с избытком.
    const rows = await this.prisma.aiMessage.findMany({
      where: { conversationId, role: { in: roles } },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { role: true, content: true, createdAt: true },
    });
    rows.reverse();
    const map = { USER: 'user', ASSISTANT: 'ai', STAFF: 'staff', SYSTEM: 'system' } as const;
    return rows.map((m) => ({
      role: map[m.role as 'USER' | 'ASSISTANT' | 'STAFF' | 'SYSTEM'],
      text: m.content,
      createdAt: m.createdAt,
    }));
  }

  /**
   * Диагностика тормозов инбокса (#инцидент): живые запросы к БД >2с (что реально висит),
   * индексы ai_messages (есть ли [conversationId, createdAt]) и оценка размеров таблиц.
   * Только чтение системных вьюх Postgres. Доступ через GET /ai/inbox/diag (право guest_inbox).
   */
  async diag(): Promise<unknown> {
    const active = await this.prisma.$queryRawUnsafe(
      `select pid, extract(epoch from (now()-query_start))::int as dur_s, state,
              coalesce(wait_event_type,'') as wait,
              left(regexp_replace(query, '\\s+', ' ', 'g'), 220) as query
       from pg_stat_activity
       where state <> 'idle' and query_start < now() - interval '2 seconds'
       order by query_start asc limit 25`,
    );
    const indexes = await this.prisma.$queryRawUnsafe(
      `select indexname, indexdef from pg_indexes where tablename = 'ai_messages'`,
    );
    const sizes = await this.prisma.$queryRawUnsafe(
      `select
         (select reltuples::bigint::text from pg_class where relname='ai_messages') as ai_messages_est,
         (select reltuples::bigint::text from pg_class where relname='ai_conversations') as ai_conversations_est`,
    );
    return { active, indexes, sizes };
  }

  /**
   * Лёгкий счётчик непрочитанных эскалаций для бейджа (#1): один COUNT с LATERAL «последнее
   * сообщение» вместо выборки 200 диалогов с сообщениями и фильтрации в JS. По индексу
   * ai_messages(conversationId, createdAt) — быстро даже при частом опросе.
   */
  async unreadEscalatedCount(tenantId: string): Promise<number> {
    // Субзапрос явно фильтрует ai_conversations ДО LATERAL — гарантирует, что Postgres
    // применяет индекс (tenantId, actorKind, status) вместо потенциального full-scan.
    const rows = await this.prisma.$queryRaw<Array<{ c: number }>>`
      SELECT count(*)::int AS c
      FROM (
        SELECT id, "operatorReadAt"
        FROM ai_conversations
        WHERE "tenantId" = ${tenantId}
          AND "actorKind" = 'GUEST'
          AND status = 'ESCALATED'
      ) conv
      JOIN LATERAL (
        SELECT m.role, m."createdAt"
        FROM ai_messages m
        WHERE m."conversationId" = conv.id
          AND m.role IN ('USER','ASSISTANT','STAFF')
        ORDER BY m."createdAt" DESC
        LIMIT 1
      ) last ON true
      WHERE last.role = 'USER'
        AND (conv."operatorReadAt" IS NULL OR last."createdAt" > conv."operatorReadAt")`;
    return rows[0]?.c ?? 0;
  }

  /** История в формате LLM (для передачи модели). */
  async history(conversationId: string): Promise<LlmMessage[]> {
    // Лимит: берём ПОСЛЕДНИЕ 200 сообщений (desc + take), затем разворачиваем.
    // Без лимита длинные диалоги грузили тысячи строк при КАЖДОМ входящем вебхуке →
    // держали соединение пула на секунды и засоряли контекст LLM (модели это не нужно).
    const rows = await this.prisma.aiMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    rows.reverse();
    return rows.map((m) => ({
      role: ROLE_TO_LLM[m.role],
      content: m.content,
      toolCalls:
        m.role === 'ASSISTANT' && m.toolCalls ? (m.toolCalls as unknown as LlmToolCall[]) : undefined,
      toolCallId: m.toolCallId ?? undefined,
      name: m.toolName ?? undefined,
    }));
  }

  addMessage(conversationId: string, input: AddMessageInput) {
    // Сообщение гостя может изменить «непрочитано» в ленте → будим realtime-бейдж (#1).
    if (input.role === AiMessageRole.USER) this.inboxEvents.publish('message');
    return this.prisma.aiMessage.create({
      data: {
        conversationId,
        role: input.role,
        content: input.content,
        toolName: input.toolName,
        toolCallId: input.toolCallId,
        toolCalls: input.toolCalls
          ? (input.toolCalls as unknown as Prisma.InputJsonValue)
          : undefined,
        tokensIn: input.tokensIn ?? 0,
        tokensOut: input.tokensOut ?? 0,
        model: input.model,
      },
    });
  }

  /**
   * Все ГОСТЕВЫЕ диалоги (actorKind=GUEST) для мониторинга в админке — не только
   * эскалированные. Возвращает превью последнего содержательного сообщения (без
   * tool-строк). Фильтры по статусу/каналу опциональны.
   */
  async listGuestConversations(
    tenantId: string,
    opts: { status?: AiConversationStatus; channel?: AiChannel } = {},
  ) {
    const rows = await this.prisma.aiConversation.findMany({
      where: {
        tenantId,
        actorKind: AiActorKind.GUEST,
        ...(opts.status ? { status: opts.status } : {}),
        ...(opts.channel ? { channel: opts.channel } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      select: {
        id: true,
        channel: true,
        status: true,
        title: true,
        guestId: true,
        operatorId: true,
        operatorReadAt: true,
        externalId: true,
        channelMeta: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          where: { role: { in: [AiMessageRole.USER, AiMessageRole.ASSISTANT, AiMessageRole.STAFF] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { role: true, content: true, createdAt: true },
        },
      },
    });
    const roleMap = { USER: 'user', ASSISTANT: 'ai', STAFF: 'staff' } as const;
    return rows.map(({ messages, operatorReadAt, channelMeta, ...rest }) => {
      const last = messages[0];
      const lastRole = last ? roleMap[last.role as 'USER' | 'ASSISTANT' | 'STAFF'] : null;
      const lastAt = last?.createdAt ?? rest.updatedAt;
      // Непрочитано: последнее сообщение — от гостя и новее момента, когда оператор
      // в последний раз открывал диалог (или он ещё ни разу не открывал).
      const unread = lastRole === 'user' && (!operatorReadAt || lastAt > operatorReadAt);
      // Подканал (для Umnico: telegram/whatsapp/… — откуда пишет гость, #14) + фото/телефон/ник
      // из канала (channelMeta). saId/customerId — чтобы добрать тип/телефон/фото «на лету» для
      // старых диалогов. sourceType «message» из старых версий считаем невалидным (не «message»).
      const meta = (channelMeta as {
        sourceType?: string; avatar?: string; phone?: string; saId?: string;
        customerId?: string; name?: string; username?: string;
      } | null) ?? {};
      const st = meta.sourceType && meta.sourceType !== 'message' ? meta.sourceType : null;
      return {
        ...rest,
        lastRole,
        lastMessage: last?.content ?? null,
        lastAt,
        unread,
        subChannel: st,
        avatar: meta.avatar ?? null,
        metaPhone: meta.phone ?? null,
        metaName: meta.name ?? meta.username ?? null,
        saId: meta.saId ?? null,
        customerId: meta.customerId ?? null,
      };
    });
  }

  /** Диалоги по статусу (лента эскалаций: status = ESCALATED). */
  listByStatus(tenantId: string, status: AiConversationStatus) {
    return this.prisma.aiConversation.findMany({
      where: { tenantId, status },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        channel: true,
        guestId: true,
        operatorId: true,
        externalId: true,
        createdAt: true,
        updatedAt: true,
      },
      take: 100,
    });
  }

  async assignOperator(id: string, operatorId: string) {
    // assignedAt фиксируем один раз — первый оператор, взявший диалог (time-to-pickup §5.7).
    await this.prisma.aiConversation.updateMany({
      where: { id, assignedAt: null },
      data: { assignedAt: new Date() },
    });
    return this.prisma.aiConversation.update({ where: { id }, data: { operatorId } });
  }

  setStatus(id: string, status: AiConversationStatus) {
    // Ставим вехи для QA-метрик (§5.7): эскалация и закрытие диалога.
    const data: Prisma.AiConversationUpdateInput = { status };
    if (status === AiConversationStatus.ESCALATED) {
      data.escalatedAt = new Date();
      this.inboxEvents.publish('escalated'); // новая эскалация → realtime-бейдж (#1)
    }
    if (status === AiConversationStatus.CLOSED) data.closedAt = new Date();
    return this.prisma.aiConversation.update({ where: { id }, data });
  }

  addToolAudit(input: AddToolAuditInput) {
    return this.prisma.aiToolAudit.create({
      data: {
        tenantId: input.tenantId,
        conversationId: input.conversationId,
        actorKind: input.actorKind,
        guestId: input.guestId,
        employeeId: input.employeeId,
        toolName: input.toolName,
        argsRedacted: input.argsRedacted
          ? (input.argsRedacted as Prisma.InputJsonValue)
          : undefined,
        allowed: input.allowed ?? true,
        isError: input.isError ?? false,
        result: input.result,
      },
    });
  }
}
