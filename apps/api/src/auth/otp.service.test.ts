import { describe, expect, it, vi, beforeEach } from 'vitest';
import { HttpException } from '@nestjs/common';
import { OtpChannel, OtpPurpose } from '@prisma/client';
import { OtpService } from './otp.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CryptoService } from '../common/crypto/crypto.service.js';
import type { SmsSender } from '../notifications/sms/sms.port.js';
import type { EmailSender } from '../notifications/email/email.port.js';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';

function setup() {
  const prisma = {
    otpCode: {
      findFirst: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue({ id: 'o1' }),
      update: vi.fn(),
    },
  } as unknown as PrismaService;
  const crypto = { hash: (s: string) => `h:${s}` } as unknown as CryptoService;
  const sms = { send: vi.fn().mockResolvedValue(undefined) } as unknown as SmsSender;
  const email = { send: vi.fn().mockResolvedValue(undefined) } as unknown as EmailSender;
  const config = {
    get: vi.fn((key: string) => (key === 'OTP_LENGTH' ? 6 : 300)),
  } as unknown as ConfigService<Env, true>;
  const service = new OtpService(prisma, crypto, sms, email, config);
  return { service, prisma, sms };
}

describe('OtpService.request — анти-флуд', () => {
  beforeEach(() => vi.clearAllMocks());

  it('отправляет код, когда истории нет', async () => {
    const { service, prisma, sms } = setup();
    await service.request(OtpChannel.PHONE, '+79210000000', OtpPurpose.LOGIN);
    expect(prisma.otpCode.create).toHaveBeenCalled();
    expect(sms.send).toHaveBeenCalledOnce();
  });

  it('отклоняет повторный запрос в пределах cooldown (429)', async () => {
    const { service, prisma, sms } = setup();
    vi.mocked(prisma.otpCode.findFirst).mockResolvedValue({
      createdAt: new Date(Date.now() - 5_000),
    } as never);
    await expect(
      service.request(OtpChannel.PHONE, '+79210000000', OtpPurpose.LOGIN),
    ).rejects.toBeInstanceOf(HttpException);
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
    expect(sms.send).not.toHaveBeenCalled();
  });

  it('отклоняет при превышении часового лимита (429)', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.otpCode.findFirst).mockResolvedValue({
      createdAt: new Date(Date.now() - 120_000), // cooldown прошёл
    } as never);
    vi.mocked(prisma.otpCode.count).mockResolvedValue(5); // но час уже исчерпан
    await expect(
      service.request(OtpChannel.EMAIL, 'a@b.ru', OtpPurpose.LOGIN),
    ).rejects.toBeInstanceOf(HttpException);
    expect(prisma.otpCode.create).not.toHaveBeenCalled();
  });

  it('пропускает, когда cooldown прошёл и лимит не исчерпан', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.otpCode.findFirst).mockResolvedValue({
      createdAt: new Date(Date.now() - 120_000),
    } as never);
    vi.mocked(prisma.otpCode.count).mockResolvedValue(2);
    await service.request(OtpChannel.EMAIL, 'a@b.ru', OtpPurpose.LOGIN);
    expect(prisma.otpCode.create).toHaveBeenCalled();
  });
});
