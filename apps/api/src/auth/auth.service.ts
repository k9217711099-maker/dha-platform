import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConsentType, Guest, OtpChannel, OtpPurpose, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { OtpService } from './otp.service.js';
import { TokensService, type TokenPair } from './tokens.service.js';
import type {
  LoginEmailDto,
  RegisterEmailDto,
  VerifyEmailOtpDto,
  VerifyPhoneOtpDto,
} from './dto/auth.dto.js';

const BCRYPT_ROUNDS = 10;

/** Сценарии регистрации и входа (§5.1, §5.2). */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokensService,
    private readonly tenant: TenantService,
  ) {}

  // --- OTP по телефону ---
  async requestPhoneOtp(phone: string): Promise<void> {
    await this.otp.request(OtpChannel.PHONE, phone, OtpPurpose.LOGIN);
  }

  async verifyPhoneOtp(dto: VerifyPhoneOtpDto): Promise<TokenPair> {
    const ok = await this.otp.verify(OtpChannel.PHONE, dto.phone, dto.code);
    if (!ok) throw new UnauthorizedException('Неверный или просроченный код');

    const guest = await this.findOrCreateGuest(
      { phone: dto.phone },
      { phone: dto.phone, phoneVerified: true },
      dto.acceptPersonalData,
      dto.acceptMarketing,
    );
    return this.tokens.issuePair(guest.id);
  }

  // --- OTP по email ---
  async requestEmailOtp(email: string): Promise<void> {
    await this.otp.request(OtpChannel.EMAIL, email, OtpPurpose.LOGIN);
  }

  async verifyEmailOtp(dto: VerifyEmailOtpDto): Promise<TokenPair> {
    const ok = await this.otp.verify(OtpChannel.EMAIL, dto.email, dto.code);
    if (!ok) throw new UnauthorizedException('Неверный или просроченный код');

    const guest = await this.findOrCreateGuest(
      { email: dto.email },
      { email: dto.email, emailVerified: true },
      dto.acceptPersonalData,
      dto.acceptMarketing,
    );
    return this.tokens.issuePair(guest.id);
  }

  // --- Email + пароль ---
  async registerEmail(dto: RegisterEmailDto): Promise<TokenPair> {
    if (!dto.acceptPersonalData) {
      throw new BadRequestException('Требуется согласие на обработку персональных данных');
    }
    const existing = await this.prisma.guest.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Гость с таким email уже зарегистрирован');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const tenantId = await this.tenant.getDefaultTenantId();
    const guest = await this.prisma.guest.create({
      data: {
        tenant: { connect: { id: tenantId } },
        email: dto.email,
        passwordHash,
        consents: { create: this.buildConsents(dto.acceptPersonalData, dto.acceptMarketing) },
      },
    });
    return this.tokens.issuePair(guest.id);
  }

  async loginEmail(dto: LoginEmailDto): Promise<TokenPair> {
    const guest = await this.prisma.guest.findUnique({ where: { email: dto.email } });
    if (!guest?.passwordHash || !(await bcrypt.compare(dto.password, guest.passwordHash))) {
      throw new UnauthorizedException('Неверный email или пароль');
    }
    return this.tokens.issuePair(guest.id);
  }

  // --- Токены ---
  refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
  }

  // --- Вспомогательное ---
  private async findOrCreateGuest(
    where: Prisma.GuestWhereUniqueInput,
    createData: Omit<Prisma.GuestCreateInput, 'tenant' | 'consents'>,
    acceptPersonalData: boolean,
    acceptMarketing?: boolean,
  ): Promise<Guest> {
    const existing = await this.prisma.guest.findUnique({ where });
    if (existing) return existing;

    if (!acceptPersonalData) {
      throw new BadRequestException('Требуется согласие на обработку персональных данных');
    }
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.prisma.guest.create({
      data: {
        ...createData,
        tenant: { connect: { id: tenantId } },
        consents: { create: this.buildConsents(acceptPersonalData, acceptMarketing) },
      },
    });
  }

  private buildConsents(
    personalData: boolean,
    marketing?: boolean,
  ): Prisma.GuestConsentCreateWithoutGuestInput[] {
    return [
      { type: ConsentType.PERSONAL_DATA, granted: personalData },
      { type: ConsentType.MARKETING, granted: marketing ?? false },
    ];
  }
}
