import { describe, it, expect, vi } from 'vitest';
import { OperatorInboxService } from './operator-inbox.service.js';
import type { ConversationService } from '../conversations/conversation.service.js';
import type { AiDirectoryService } from '../directory/ai-directory.service.js';
import type { TelegramPort } from '../../integrations/telegram/telegram.port.js';

function setup(convo: Record<string, unknown> | null) {
  const conversations = {
    get: vi.fn().mockResolvedValue(convo),
    listByStatus: vi.fn().mockResolvedValue([]),
    threadView: vi.fn().mockResolvedValue([]),
    assignOperator: vi.fn(),
    addMessage: vi.fn(),
    setStatus: vi.fn(),
  } as unknown as ConversationService;
  const directory = {
    guests: vi.fn().mockResolvedValue(new Map()),
    operators: vi.fn().mockResolvedValue(new Map()),
  } as unknown as AiDirectoryService;
  const telegram = { sendMessage: vi.fn() } as unknown as TelegramPort;
  return { svc: new OperatorInboxService(conversations, directory, telegram), conversations, telegram };
}

describe('OperatorInboxService', () => {
  it('reply: сохраняет ответ оператора (STAFF), берёт диалог на себя и шлёт в Telegram', async () => {
    const { svc, conversations, telegram } = setup({ id: 'c1', channel: 'TELEGRAM', externalId: '555' });
    await svc.reply('c1', 'op1', 'Здравствуйте, помогу!');
    expect(conversations.assignOperator).toHaveBeenCalledWith('c1', 'op1');
    expect(conversations.addMessage).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ role: 'STAFF', content: 'Здравствуйте, помогу!' }),
    );
    expect(telegram.sendMessage).toHaveBeenCalledWith('555', 'Здравствуйте, помогу!');
  });

  it('reply в web-канале не дёргает Telegram (гость заберёт через GET)', async () => {
    const { svc, telegram } = setup({ id: 'c1', channel: 'WEB', externalId: null });
    await svc.reply('c1', 'op1', 'ответ');
    expect(telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('close переводит диалог в CLOSED', async () => {
    const { svc, conversations } = setup({ id: 'c1', channel: 'WEB' });
    await svc.close('c1');
    expect(conversations.setStatus).toHaveBeenCalledWith('c1', 'CLOSED');
  });

  it('delegate переназначает диалог и пишет SYSTEM-заметку о передаче', async () => {
    const { svc, conversations } = setup({ id: 'c1', channel: 'WEB' });
    await svc.delegate('c1', 'op1', 'op2', 'оплата — к бухгалтеру');
    expect(conversations.assignOperator).toHaveBeenCalledWith('c1', 'op2');
    expect(conversations.addMessage).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ role: 'SYSTEM', content: expect.stringContaining('передан') }),
    );
  });
});
