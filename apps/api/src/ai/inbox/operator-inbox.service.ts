import { Injectable, NotFoundException } from '@nestjs/common';
import { AiChannel, AiConversationStatus, AiMessageRole } from '@prisma/client';
import { ConversationService } from '../conversations/conversation.service.js';
import { AiDirectoryService } from '../directory/ai-directory.service.js';
import { TelegramPort } from '../../integrations/telegram/telegram.port.js';

/**
 * Лента эскалаций (operator inbox, §4.7): оператор видит переданные человеку
 * диалоги, читает историю, отвечает гостю. Ответ доставляется в канал гостя:
 * Telegram — сразу через бота; web/app — гость забирает через GET
 * /ai/guest/conversation/:id. Замыкает цикл «AI → человек».
 */
@Injectable()
export class OperatorInboxService {
  constructor(
    private readonly conversations: ConversationService,
    private readonly directory: AiDirectoryService,
    private readonly telegram: TelegramPort,
  ) {}

  /** Очередь: диалоги в статусе ESCALATED (+ имена гостя/оператора). */
  async list(tenantId: string) {
    const rows = await this.conversations.listByStatus(tenantId, AiConversationStatus.ESCALATED);
    const [guests, operators] = await Promise.all([
      this.directory.guests(rows.map((r) => r.guestId)),
      this.directory.operators(rows.map((r) => r.operatorId)),
    ]);
    return rows.map((r) => ({
      ...r,
      guestName: (r.guestId && guests.get(r.guestId)) || null,
      operatorName: (r.operatorId && operators.get(r.operatorId)) || null,
    }));
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
      this.directory.guests(rows.map((r) => r.guestId)),
      this.directory.operators(rows.map((r) => r.operatorId)),
    ]);
    return rows.map((r) => ({
      ...r,
      guestName: (r.guestId && guests.get(r.guestId)) || null,
      operatorName: (r.operatorId && operators.get(r.operatorId)) || null,
    }));
  }

  async thread(id: string) {
    const convo = await this.conversations.get(id);
    if (!convo) throw new NotFoundException('Диалог не найден');
    const [messages, guests, operators] = await Promise.all([
      this.conversations.threadView(id, { includeSystem: true }), // операторская лента видит SYSTEM-заметки (лог делегирования)
      this.directory.guests([convo.guestId]),
      this.directory.operators([convo.operatorId]),
    ]);
    return {
      conversation: {
        id: convo.id,
        channel: convo.channel,
        status: convo.status,
        guestId: convo.guestId,
        guestName: (convo.guestId && guests.get(convo.guestId)) || null,
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
    if (convo.channel === AiChannel.TELEGRAM && convo.externalId) {
      await this.telegram.sendMessage(convo.externalId, text);
    }
    return { ok: true };
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
