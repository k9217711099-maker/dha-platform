import { Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Bitrix24Port,
  type CreateDealInput,
  type CreateTaskInput,
  type OpenLineMessageInput,
  type UpsertContactInput,
} from './bitrix24.port.js';
import type { Env } from '../../config/env.schema.js';

/**
 * Реальный адаптер Bitrix24 (входящий вебхук REST: crm.contact.add, crm.deal.add,
 * tasks.task.add, imopenlines...). ЗАГОТОВКА: реализуется после настройки вебхука
 * (BITRIX24_WEBHOOK_URL) и согласования сущностей (§23). До этого — Mock.
 */
@Injectable()
export class HttpBitrix24Adapter extends Bitrix24Port {
  private readonly webhookUrl: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.webhookUrl = config.get('BITRIX24_WEBHOOK_URL', { infer: true }) ?? '';
  }

  private notReady(): never {
    throw new NotImplementedException(
      'HttpBitrix24Adapter ещё не реализован — нужен BITRIX24_WEBHOOK_URL. Используйте BITRIX24_PROVIDER=mock.',
    );
  }

  upsertContact(_input: UpsertContactInput): Promise<{ contactId: string }> {
    return this.notReady();
  }
  createDeal(_input: CreateDealInput): Promise<{ dealId: string }> {
    return this.notReady();
  }
  addTimelineComment(_entity: { dealId?: string; contactId?: string }, _comment: string): Promise<void> {
    return this.notReady();
  }
  createTask(_input: CreateTaskInput): Promise<{ taskId: string }> {
    return this.notReady();
  }
  sendOpenLineMessage(_input: OpenLineMessageInput): Promise<{ messageId: string }> {
    return this.notReady();
  }
}
