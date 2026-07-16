import { describe, it, expect, vi } from 'vitest';
import { TgUserbotAgentService } from './tg-userbot-agent.service.js';
import type { GuestAgentService } from '../agents/guest-agent.service.js';
import type { ConversationService } from '../conversations/conversation.service.js';
import type { TelegramUserbotPort } from '../../integrations/telegram-userbot/telegram-userbot.port.js';
import type { TelegramUserbotService } from '../../integrations/telegram-userbot/telegram-userbot.service.js';
import type { TenantService } from '../../pms/tenant/tenant.service.js';

function setup(existing: { id: string } | null) {
  const guestAgent = {
    handle: vi.fn().mockResolvedValue({ conversationId: 'conv1', reply: 'Здравствуйте!', escalated: false }),
  } as unknown as GuestAgentService;
  const conversations = {
    findByExternal: vi.fn().mockResolvedValue(existing),
    setExternalId: vi.fn(),
  } as unknown as ConversationService;
  const userbot = { sendMessage: vi.fn() } as unknown as TelegramUserbotPort;
  const userbotService = { registerHandler: vi.fn() } as unknown as TelegramUserbotService;
  const tenant = { getDefaultTenantId: vi.fn().mockResolvedValue('t1') } as unknown as TenantService;
  const svc = new TgUserbotAgentService(guestAgent, conversations, userbot, userbotService, tenant);
  return { svc, guestAgent, conversations, userbot, userbotService };
}

describe('TgUserbotAgentService', () => {
  it('регистрирует обработчик в userbot при инициализации', () => {
    const { svc, userbotService } = setup(null);
    svc.onModuleInit();
    expect(userbotService.registerHandler).toHaveBeenCalledOnce();
  });

  it('новый чат: канал TELEGRAM_DIRECT, привязка userId, ответ', async () => {
    const { svc, guestAgent, conversations, userbot } = setup(null);
    await svc.handle('42', 'Привет');
    expect(guestAgent.handle).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'TELEGRAM_DIRECT', text: 'Привет', conversationId: undefined }),
    );
    expect(conversations.setExternalId).toHaveBeenCalledWith('conv1', '42');
    expect(userbot.sendMessage).toHaveBeenCalledWith('42', 'Здравствуйте!');
  });

  it('существующий чат: продолжает диалог', async () => {
    const { svc, guestAgent, conversations } = setup({ id: 'convX' });
    await svc.handle('42', 'ещё');
    expect(guestAgent.handle).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'convX' }));
    expect(conversations.setExternalId).not.toHaveBeenCalled();
  });
});
