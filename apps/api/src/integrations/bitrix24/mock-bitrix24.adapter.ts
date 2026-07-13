import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import {
  Bitrix24Port,
  type CreateDealInput,
  type CreateTaskInput,
  type OpenLineMessageInput,
  type UpsertContactInput,
} from './bitrix24.port.js';

/** In-memory реализация Bitrix24 для разработки и тестов (пишет в лог). */
@Injectable()
export class MockBitrix24Adapter extends Bitrix24Port {
  private readonly logger = new Logger('MockBitrix24');
  private readonly contacts = new Map<string, string>(); // guestId -> contactId

  async upsertContact(input: UpsertContactInput): Promise<{ contactId: string }> {
    let contactId = this.contacts.get(input.guestId);
    if (!contactId) {
      contactId = `b24-contact-${randomUUID()}`;
      this.contacts.set(input.guestId, contactId);
    }
    this.logger.log(`Контакт ${contactId} (гость ${input.guestId})`);
    return { contactId };
  }

  async createDeal(input: CreateDealInput): Promise<{ dealId: string }> {
    const dealId = `b24-deal-${randomUUID()}`;
    this.logger.log(`Сделка ${dealId}: "${input.title}" ${input.amountRub} ₽`);
    return { dealId };
  }

  async addTimelineComment(entity: { dealId?: string; contactId?: string }, comment: string): Promise<void> {
    this.logger.log(`Таймлайн ${entity.dealId ?? entity.contactId}: ${comment}`);
  }

  async createTask(input: CreateTaskInput): Promise<{ taskId: string }> {
    const taskId = `b24-task-${randomUUID()}`;
    this.logger.log(`Задача ${taskId}: "${input.title}"`);
    return { taskId };
  }

  async sendOpenLineMessage(input: OpenLineMessageInput): Promise<{ messageId: string }> {
    const messageId = `b24-msg-${randomUUID()}`;
    this.logger.log(`Открытая линия (${input.guestRef}): ${input.text}`);
    return { messageId };
  }
}
