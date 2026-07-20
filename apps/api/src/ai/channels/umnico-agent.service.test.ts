import { describe, it, expect, vi } from 'vitest';
import { UmnicoAgentService } from './umnico-agent.service.js';
import type { GuestAgentService } from '../agents/guest-agent.service.js';
import type { ConversationService } from '../conversations/conversation.service.js';
import type { UmnicoConfigService } from '../../integrations/umnico/umnico-config.service.js';
import type { TenantService } from '../../pms/tenant/tenant.service.js';
import type { ChannelToggleService } from './channel-toggle.service.js';

function setup(existing: { id: string } | null) {
  const guestAgent = {
    handle: vi.fn().mockResolvedValue({ conversationId: 'conv1', reply: 'Здравствуйте!', escalated: false }),
  } as unknown as GuestAgentService;
  const conversations = {
    findByExternal: vi.fn().mockResolvedValue(existing),
    setExternalId: vi.fn(),
    setChannelMeta: vi.fn(),
    setGuestId: vi.fn(),
    findGuestIdByPhone: vi.fn().mockResolvedValue(null),
  } as unknown as ConversationService;
  const umnico = { sendMessage: vi.fn() } as unknown as UmnicoConfigService;
  const tenant = { getDefaultTenantId: vi.fn().mockResolvedValue('t1') } as unknown as TenantService;
  const toggle = { isChannelEnabledFor: vi.fn().mockResolvedValue(true) } as unknown as ChannelToggleService;
  const svc = new UmnicoAgentService(guestAgent, conversations, umnico, tenant, toggle);
  return { svc, guestAgent, conversations, umnico };
}

describe('UmnicoAgentService', () => {
  it('новый диалог: канал UMNICO, привязка leadId, ответ через Umnico', async () => {
    const { svc, guestAgent, conversations, umnico } = setup(null);
    await svc.handleIncoming({ leadId: '90', source: 's1', userId: 'u1', text: 'Привет' });
    expect(guestAgent.handle).toHaveBeenCalledWith(
      expect.objectContaining({ channel: 'UMNICO', text: 'Привет', conversationId: undefined }),
    );
    expect(conversations.setExternalId).toHaveBeenCalledWith('conv1', '90');
    expect(umnico.sendMessage).toHaveBeenCalledWith({ leadId: '90', source: 's1', userId: 'u1' }, 'Здравствуйте!');
  });

  it('существующий диалог: продолжает, не пере-привязывает', async () => {
    const { svc, guestAgent, conversations } = setup({ id: 'convX' });
    await svc.handleIncoming({ leadId: '90', text: 'ещё' });
    expect(guestAgent.handle).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'convX' }));
    expect(conversations.setExternalId).not.toHaveBeenCalled();
  });

  it('пустой текст / без leadId — игнор', async () => {
    const { svc, guestAgent } = setup(null);
    await svc.handleIncoming({ leadId: '90', text: '' });
    await svc.handleIncoming({ leadId: '', text: 'hi' });
    expect(guestAgent.handle).not.toHaveBeenCalled();
  });

  it('телефон совпал с профилем → диалог привязывается к гостю (#8)', async () => {
    const { svc, conversations } = setup(null);
    (conversations.findGuestIdByPhone as ReturnType<typeof vi.fn>).mockResolvedValue('guest-1');
    await svc.handleIncoming({ leadId: '90', phone: '+79217711099', text: 'Привет' });
    expect(conversations.findGuestIdByPhone).toHaveBeenCalledWith('t1', '+79217711099');
    expect(conversations.setGuestId).toHaveBeenCalledWith('conv1', 'guest-1');
  });
});
