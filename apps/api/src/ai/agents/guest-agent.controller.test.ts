import { describe, it, expect, vi } from 'vitest';
import type { Request } from 'express';
import { AiChannel } from '@prisma/client';
import { GuestAgentController } from './guest-agent.controller.js';
import type { GuestAgentService } from './guest-agent.service.js';
import type { TenantService } from '../../pms/tenant/tenant.service.js';
import type { JwtService } from '@nestjs/jwt';
import type { ConversationService } from '../conversations/conversation.service.js';

function setup() {
  const agent = {
    handle: vi.fn().mockResolvedValue({ conversationId: 'c1', reply: 'ok', escalated: false }),
  } as unknown as GuestAgentService;
  const tenant = { getDefaultTenantId: vi.fn().mockResolvedValue('t1') } as unknown as TenantService;
  const jwt = { verifyAsync: vi.fn() } as unknown as JwtService;
  const conversations = { threadView: vi.fn() } as unknown as ConversationService;
  return { agent, tenant, jwt, ctrl: new GuestAgentController(agent, tenant, jwt, conversations) };
}

const reqWith = (authorization?: string) =>
  ({ headers: authorization ? { authorization } : {} }) as unknown as Request;

describe('GuestAgentController', () => {
  it('аноним (без токена): tenant по умолчанию, guestId не передаётся', async () => {
    const { ctrl, agent, jwt } = setup();
    const res = await ctrl.message({ text: 'здравствуйте' }, reqWith());
    expect(res.reply).toBe('ok');
    expect(jwt.verifyAsync).not.toHaveBeenCalled();
    expect(agent.handle).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't1', channel: AiChannel.WEB, guestId: undefined }),
    );
  });

  it('валидный Bearer: привязывает guestId', async () => {
    const { ctrl, agent, jwt } = setup();
    vi.mocked(jwt.verifyAsync).mockResolvedValue({ sub: 'g1' } as never);
    await ctrl.message({ text: 'хочу бронь' }, reqWith('Bearer good.token'));
    expect(agent.handle).toHaveBeenCalledWith(expect.objectContaining({ guestId: 'g1' }));
  });

  it('битый токен: тихо трактуется как аноним', async () => {
    const { ctrl, agent, jwt } = setup();
    vi.mocked(jwt.verifyAsync).mockRejectedValue(new Error('bad'));
    await ctrl.message({ text: 'привет' }, reqWith('Bearer bad'));
    expect(agent.handle).toHaveBeenCalledWith(expect.objectContaining({ guestId: undefined }));
  });
});
