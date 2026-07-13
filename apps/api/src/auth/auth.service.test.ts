import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { OtpService } from './otp.service.js';
import { TokensService } from './tokens.service.js';
import { TenantService } from '../pms/tenant/tenant.service.js';

const pair = { accessToken: 'a', refreshToken: 'r', expiresIn: 900 };

function setup() {
  const prisma = {
    guest: { findUnique: vi.fn(), create: vi.fn() },
  } as unknown as PrismaService;
  const otp = { verify: vi.fn(), request: vi.fn() } as unknown as OtpService;
  const tokens = { issuePair: vi.fn().mockResolvedValue(pair) } as unknown as TokensService;
  const tenant = { getDefaultTenantId: vi.fn().mockResolvedValue('t1') } as unknown as TenantService;
  const service = new AuthService(prisma, otp, tokens, tenant);
  return { service, prisma, otp, tokens, tenant };
}

describe('AuthService.registerEmail', () => {
  it('требует согласие на обработку ПДн', async () => {
    const { service } = setup();
    await expect(
      service.registerEmail({ email: 'a@b.ru', password: 'password1', acceptPersonalData: false }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('не допускает повторную регистрацию email', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.guest.findUnique).mockResolvedValue({ id: 'g1' } as never);
    await expect(
      service.registerEmail({ email: 'a@b.ru', password: 'password1', acceptPersonalData: true }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('создаёт гостя и выдаёт токены', async () => {
    const { service, prisma, tokens } = setup();
    vi.mocked(prisma.guest.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.guest.create).mockResolvedValue({ id: 'g1' } as never);
    const res = await service.registerEmail({
      email: 'a@b.ru',
      password: 'password1',
      acceptPersonalData: true,
    });
    expect(res).toEqual(pair);
    expect(tokens.issuePair).toHaveBeenCalledWith('g1');
  });
});

describe('AuthService.loginEmail', () => {
  it('отклоняет несуществующего гостя', async () => {
    const { service, prisma } = setup();
    vi.mocked(prisma.guest.findUnique).mockResolvedValue(null);
    await expect(
      service.loginEmail({ email: 'a@b.ru', password: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('отклоняет неверный пароль', async () => {
    const { service, prisma } = setup();
    const passwordHash = await bcrypt.hash('correct-pass', 10);
    vi.mocked(prisma.guest.findUnique).mockResolvedValue({ id: 'g1', passwordHash } as never);
    await expect(
      service.loginEmail({ email: 'a@b.ru', password: 'wrong-pass' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('пускает с верным паролем', async () => {
    const { service, prisma, tokens } = setup();
    const passwordHash = await bcrypt.hash('correct-pass', 10);
    vi.mocked(prisma.guest.findUnique).mockResolvedValue({ id: 'g1', passwordHash } as never);
    const res = await service.loginEmail({ email: 'a@b.ru', password: 'correct-pass' });
    expect(res).toEqual(pair);
    expect(tokens.issuePair).toHaveBeenCalledWith('g1');
  });
});

describe('AuthService.verifyPhoneOtp', () => {
  it('отклоняет неверный код', async () => {
    const { service, otp } = setup();
    vi.mocked(otp.verify).mockResolvedValue(false);
    await expect(
      service.verifyPhoneOtp({ phone: '+79210000000', code: '000000', acceptPersonalData: true }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('логинит существующего гостя по коду', async () => {
    const { service, otp, prisma, tokens } = setup();
    vi.mocked(otp.verify).mockResolvedValue(true);
    vi.mocked(prisma.guest.findUnique).mockResolvedValue({ id: 'g1' } as never);
    const res = await service.verifyPhoneOtp({
      phone: '+79210000000',
      code: '123456',
      acceptPersonalData: true,
    });
    expect(res).toEqual(pair);
    expect(tokens.issuePair).toHaveBeenCalledWith('g1');
  });
});

beforeEach(() => vi.clearAllMocks());
