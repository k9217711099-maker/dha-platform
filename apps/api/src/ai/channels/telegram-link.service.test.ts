import { describe, it, expect, vi } from 'vitest';
import { TelegramLinkService } from './telegram-link.service.js';
import type { JwtService } from '@nestjs/jwt';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';

function make() {
  const jwt = { signAsync: vi.fn(), verifyAsync: vi.fn() } as unknown as JwtService;
  const prisma = {
    guest: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  } as unknown as PrismaService;
  const config = { get: vi.fn().mockReturnValue('dha_bot') } as unknown as ConfigService<Env, true>;
  return { svc: new TelegramLinkService(jwt, prisma, config), jwt, prisma, config };
}

describe('TelegramLinkService', () => {
  it('createLinkToken: подписывает tg_link и строит deep-link', async () => {
    const { svc, jwt } = make();
    vi.mocked(jwt.signAsync).mockResolvedValue('signed');
    const res = await svc.createLinkToken('g1');
    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'g1', typ: 'tg_link' }),
      expect.any(Object),
    );
    expect(res.deepLink).toBe('https://t.me/dha_bot?start=signed');
    expect(res.expiresInSec).toBeGreaterThan(0);
  });

  it('consumeToken: принимает только typ=tg_link', async () => {
    const { svc, jwt } = make();
    vi.mocked(jwt.verifyAsync).mockResolvedValueOnce({ sub: 'g1', typ: 'tg_link' } as never);
    expect(await svc.consumeToken('t')).toBe('g1');
    vi.mocked(jwt.verifyAsync).mockResolvedValueOnce({ sub: 'g1' } as never); // обычный access-токен — без typ
    expect(await svc.consumeToken('t')).toBeNull();
    vi.mocked(jwt.verifyAsync).mockRejectedValueOnce(new Error('bad'));
    expect(await svc.consumeToken('t')).toBeNull();
  });

  it('linkChat: снимает chatId с прежнего аккаунта и ставит на текущий', async () => {
    const { svc, prisma } = make();
    vi.mocked(prisma.guest.findUnique).mockResolvedValue({ id: 'g1' } as never);
    vi.mocked(prisma.guest.update).mockResolvedValue({ firstName: 'Иван' } as never);
    const res = await svc.linkChat('555', 'g1');
    expect(prisma.guest.updateMany).toHaveBeenCalledWith({
      where: { telegramChatId: '555', NOT: { id: 'g1' } },
      data: { telegramChatId: null },
    });
    expect(prisma.guest.update).toHaveBeenCalledWith({
      where: { id: 'g1' },
      data: { telegramChatId: '555' },
      select: { firstName: true },
    });
    expect(res).toEqual({ firstName: 'Иван' });
  });
});
