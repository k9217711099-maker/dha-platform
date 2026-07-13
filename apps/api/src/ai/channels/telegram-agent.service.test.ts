import { describe, it, expect, vi } from 'vitest';
import { TelegramAgentService } from './telegram-agent.service.js';
import type { GuestAgentService } from '../agents/guest-agent.service.js';
import type { ConversationService } from '../conversations/conversation.service.js';
import type { TelegramLinkService } from './telegram-link.service.js';
import type { TelegramPort } from '../../integrations/telegram/telegram.port.js';
import type { TenantService } from '../../pms/tenant/tenant.service.js';

function setup(existing: { id: string; guestId?: string | null } | null, guestId: string | null = null) {
  const guestAgent = {
    handle: vi.fn().mockResolvedValue({ conversationId: 'conv1', reply: 'Здравствуйте!', escalated: false }),
  } as unknown as GuestAgentService;
  const conversations = {
    findByExternal: vi.fn().mockResolvedValue(existing),
    setExternalId: vi.fn(),
    setGuestId: vi.fn(),
  } as unknown as ConversationService;
  const link = {
    guestIdForChat: vi.fn().mockResolvedValue(guestId),
    consumeToken: vi.fn(),
    linkChat: vi.fn(),
  } as unknown as TelegramLinkService;
  const telegram = { sendMessage: vi.fn() } as unknown as TelegramPort;
  const tenant = { getDefaultTenantId: vi.fn().mockResolvedValue('t1') } as unknown as TenantService;
  const svc = new TelegramAgentService(guestAgent, conversations, link, telegram, tenant);
  return { svc, guestAgent, conversations, link, telegram };
}

describe('TelegramAgentService', () => {
  it('новый чат: создаёт диалог, привязывает chatId, отправляет ответ', async () => {
    const { svc, guestAgent, conversations, telegram } = setup(null);
    await svc.handleUpdate({ message: { chat: { id: 555 }, text: 'Привет' } });
    expect(guestAgent.handle).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'TELEGRAM', text: 'Привет', conversationId: undefined }),
    );
    expect(conversations.setExternalId).toHaveBeenCalledWith('conv1', '555');
    expect(telegram.sendMessage).toHaveBeenCalledWith(555, 'Здравствуйте!');
  });

  it('существующий чат: продолжает диалог, не пере-привязывает', async () => {
    const { svc, guestAgent, conversations } = setup({ id: 'convX' });
    await svc.handleUpdate({ message: { chat: { id: 555 }, text: 'ещё вопрос' } });
    expect(guestAgent.handle).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'convX' }));
    expect(conversations.setExternalId).not.toHaveBeenCalled();
  });

  it('не-текстовый апдейт игнорируется', async () => {
    const { svc, guestAgent } = setup(null);
    await svc.handleUpdate({ message: { chat: { id: 1 } } });
    expect(guestAgent.handle).not.toHaveBeenCalled();
  });

  it('/start <token>: привязывает аккаунт, подтверждает, агент не вызывается', async () => {
    const { svc, guestAgent, link, telegram } = setup(null);
    vi.mocked(link.consumeToken).mockResolvedValue('guest-9');
    vi.mocked(link.linkChat).mockResolvedValue({ firstName: 'Иван' });
    await svc.handleUpdate({ message: { chat: { id: 777 }, text: '/start abc.def.ghi' } });
    expect(link.consumeToken).toHaveBeenCalledWith('abc.def.ghi');
    expect(link.linkChat).toHaveBeenCalledWith('777', 'guest-9');
    expect(guestAgent.handle).not.toHaveBeenCalled();
    expect(telegram.sendMessage).toHaveBeenCalledWith(777, expect.stringContaining('привязан'));
  });

  it('привязанный чат: передаёт guestId в агент', async () => {
    const { svc, guestAgent } = setup(null, 'guest-1');
    await svc.handleUpdate({ message: { chat: { id: 42 }, text: 'хочу бронь' } });
    expect(guestAgent.handle).toHaveBeenCalledWith(expect.objectContaining({ guestId: 'guest-1' }));
  });
});
