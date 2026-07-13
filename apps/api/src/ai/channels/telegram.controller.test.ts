import { describe, it, expect, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtService } from '@nestjs/jwt';
import { TelegramController } from './telegram.controller.js';
import type { TelegramAgentService } from './telegram-agent.service.js';
import type { TelegramLinkService } from './telegram-link.service.js';
import type { TelegramConfigService } from '../../integrations/telegram/telegram-config.service.js';

function make(secret?: string) {
  const service = { handleUpdate: vi.fn().mockResolvedValue(undefined) } as unknown as TelegramAgentService;
  const telegramConfig = {
    resolve: vi.fn().mockResolvedValue({ apiBase: '', botToken: '', botUsername: '', webhookSecret: secret ?? '' }),
  } as unknown as TelegramConfigService;
  const link = { createLinkToken: vi.fn() } as unknown as TelegramLinkService;
  const jwt = { verifyAsync: vi.fn() } as unknown as JwtService;
  return { ctrl: new TelegramController(service, telegramConfig, link, jwt), service, link, jwt };
}

const reqWith = (authorization?: string) =>
  ({ headers: authorization ? { authorization } : {} }) as unknown as Request;

describe('TelegramController.webhook', () => {
  it('без настроенного секрета принимает апдейт', async () => {
    const { ctrl, service } = make(undefined);
    const res = await ctrl.webhook({ message: { chat: { id: 1 }, text: 'привет' } }, undefined);
    expect(res).toEqual({ ok: true });
    expect(service.handleUpdate).toHaveBeenCalled();
  });

  it('неверный секрет → 401, апдейт не обрабатывается', async () => {
    const { ctrl, service } = make('s3cret');
    await expect(ctrl.webhook({}, 'wrong')).rejects.toThrow(UnauthorizedException);
    expect(service.handleUpdate).not.toHaveBeenCalled();
  });

  it('верный секрет → принимает', async () => {
    const { ctrl, service } = make('s3cret');
    const res = await ctrl.webhook({ message: { chat: { id: 1 }, text: 'привет' } }, 's3cret');
    expect(res).toEqual({ ok: true });
    expect(service.handleUpdate).toHaveBeenCalled();
  });
});

describe('TelegramController.linkToken', () => {
  it('без Bearer → 401', async () => {
    const { ctrl } = make();
    await expect(ctrl.linkToken(reqWith())).rejects.toThrow(UnauthorizedException);
  });

  it('валидный Bearer → выдаёт токен и deep-link привязки', async () => {
    const { ctrl, jwt, link } = make();
    vi.mocked(jwt.verifyAsync).mockResolvedValue({ sub: 'g1' } as never);
    vi.mocked(link.createLinkToken).mockResolvedValue({
      token: 'tok',
      deepLink: 'https://t.me/dha_bot?start=tok',
      expiresInSec: 900,
    });
    const res = await ctrl.linkToken(reqWith('Bearer good.token'));
    expect(link.createLinkToken).toHaveBeenCalledWith('g1');
    expect(res.deepLink).toContain('t.me');
  });
});
