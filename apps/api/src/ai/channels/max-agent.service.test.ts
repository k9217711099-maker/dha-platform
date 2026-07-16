import { describe, it, expect, vi } from 'vitest';
import { MaxAgentService } from './max-agent.service.js';
import type { GuestAgentService } from '../agents/guest-agent.service.js';
import type { ConversationService } from '../conversations/conversation.service.js';
import type { MaxPort } from '../../integrations/max/max.port.js';
import type { TenantService } from '../../pms/tenant/tenant.service.js';

function setup(existing: { id: string } | null) {
  const guestAgent = {
    handle: vi.fn().mockResolvedValue({ conversationId: 'conv1', reply: 'Здравствуйте!', escalated: false }),
  } as unknown as GuestAgentService;
  const conversations = {
    findByExternal: vi.fn().mockResolvedValue(existing),
    setExternalId: vi.fn(),
  } as unknown as ConversationService;
  const max = { sendMessage: vi.fn() } as unknown as MaxPort;
  const tenant = { getDefaultTenantId: vi.fn().mockResolvedValue('t1') } as unknown as TenantService;
  const svc = new MaxAgentService(guestAgent, conversations, max, tenant);
  return { svc, guestAgent, conversations, max };
}

const msg = (chatId: number, text?: string) => ({
  update_type: 'message_created',
  message: { recipient: { chat_id: chatId }, body: text === undefined ? {} : { text } },
});

describe('MaxAgentService', () => {
  it('новый чат: создаёт диалог, привязывает chat_id, отправляет ответ', async () => {
    const { svc, guestAgent, conversations, max } = setup(null);
    await svc.handleUpdate(msg(555, 'Привет'));
    expect(guestAgent.handle).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'MAX', text: 'Привет', conversationId: undefined }),
    );
    expect(conversations.setExternalId).toHaveBeenCalledWith('conv1', '555');
    expect(max.sendMessage).toHaveBeenCalledWith(555, 'Здравствуйте!');
  });

  it('существующий чат: продолжает диалог, не пере-привязывает', async () => {
    const { svc, guestAgent, conversations } = setup({ id: 'convX' });
    await svc.handleUpdate(msg(555, 'ещё вопрос'));
    expect(guestAgent.handle).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'convX' }));
    expect(conversations.setExternalId).not.toHaveBeenCalled();
  });

  it('не-текстовый апдейт игнорируется', async () => {
    const { svc, guestAgent } = setup(null);
    await svc.handleUpdate(msg(1));
    expect(guestAgent.handle).not.toHaveBeenCalled();
  });

  it('не message_created игнорируется', async () => {
    const { svc, guestAgent } = setup(null);
    await svc.handleUpdate({ update_type: 'bot_started', message: { recipient: { chat_id: 1 }, body: { text: 'hi' } } });
    expect(guestAgent.handle).not.toHaveBeenCalled();
  });

  it('/start: приветствие, агент не вызывается', async () => {
    const { svc, guestAgent, max } = setup(null);
    await svc.handleUpdate(msg(777, '/start'));
    expect(guestAgent.handle).not.toHaveBeenCalled();
    expect(max.sendMessage).toHaveBeenCalledWith(777, expect.stringContaining('AI-администратор'));
  });
});
