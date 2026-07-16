import { describe, it, expect, vi } from 'vitest';
import { WhatsAppAgentService } from './whatsapp-agent.service.js';
import type { GuestAgentService } from '../agents/guest-agent.service.js';
import type { ConversationService } from '../conversations/conversation.service.js';
import type { WhatsAppPort } from '../../integrations/whatsapp/whatsapp.port.js';
import type { WhatsAppService } from '../../integrations/whatsapp/whatsapp.service.js';
import type { TenantService } from '../../pms/tenant/tenant.service.js';

function setup(existing: { id: string } | null) {
  const guestAgent = {
    handle: vi.fn().mockResolvedValue({ conversationId: 'conv1', reply: 'Здравствуйте!', escalated: false }),
  } as unknown as GuestAgentService;
  const conversations = {
    findByExternal: vi.fn().mockResolvedValue(existing),
    setExternalId: vi.fn(),
  } as unknown as ConversationService;
  const wa = { sendMessage: vi.fn() } as unknown as WhatsAppPort;
  const waService = { registerHandler: vi.fn() } as unknown as WhatsAppService;
  const tenant = { getDefaultTenantId: vi.fn().mockResolvedValue('t1') } as unknown as TenantService;
  const svc = new WhatsAppAgentService(guestAgent, conversations, wa, waService, tenant);
  return { svc, guestAgent, conversations, wa, waService };
}

const JID = '79990000000@s.whatsapp.net';

describe('WhatsAppAgentService', () => {
  it('регистрирует обработчик в WhatsAppService при инициализации', () => {
    const { svc, waService } = setup(null);
    svc.onModuleInit();
    expect(waService.registerHandler).toHaveBeenCalledOnce();
  });

  it('новый чат: создаёт диалог, привязывает jid, отправляет ответ', async () => {
    const { svc, guestAgent, conversations, wa } = setup(null);
    await svc.handle(JID, 'Привет');
    expect(guestAgent.handle).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'WHATSAPP', text: 'Привет', conversationId: undefined }),
    );
    expect(conversations.setExternalId).toHaveBeenCalledWith('conv1', JID);
    expect(wa.sendMessage).toHaveBeenCalledWith(JID, 'Здравствуйте!');
  });

  it('существующий чат: продолжает диалог, не пере-привязывает', async () => {
    const { svc, guestAgent, conversations } = setup({ id: 'convX' });
    await svc.handle(JID, 'ещё вопрос');
    expect(guestAgent.handle).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'convX' }));
    expect(conversations.setExternalId).not.toHaveBeenCalled();
  });

  it('пустой текст игнорируется', async () => {
    const { svc, guestAgent } = setup(null);
    await svc.handle(JID, '');
    expect(guestAgent.handle).not.toHaveBeenCalled();
  });
});
