/** Контракт интеграции с Bitrix24 (CRM и открытые линии, §15). */

export interface UpsertContactInput {
  guestId: string;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface CreateDealInput {
  contactId: string;
  title: string;
  amountRub: number;
  bookingRef: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
}

export interface OpenLineMessageInput {
  guestRef: string;
  contactId?: string | null;
  text: string;
  topic?: string;
}

/**
 * Порт Bitrix24. Реализации: MockBitrix24Adapter (разработка) и HttpBitrix24Adapter
 * (входящий вебхук REST). Bitrix24 — источник истины по коммуникациям и задачам.
 */
export abstract class Bitrix24Port {
  abstract upsertContact(input: UpsertContactInput): Promise<{ contactId: string }>;
  abstract createDeal(input: CreateDealInput): Promise<{ dealId: string }>;
  abstract addTimelineComment(
    entity: { dealId?: string; contactId?: string },
    comment: string,
  ): Promise<void>;
  abstract createTask(input: CreateTaskInput): Promise<{ taskId: string }>;
  abstract sendOpenLineMessage(input: OpenLineMessageInput): Promise<{ messageId: string }>;
}
