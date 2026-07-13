import { randomInt } from 'node:crypto';
import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OtpChannel, OtpPurpose } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CryptoService } from '../common/crypto/crypto.service.js';
import { SmsSender } from '../notifications/sms/sms.port.js';
import { EmailSender } from '../notifications/email/email.port.js';
import type { Env } from '../config/env.schema.js';

const MAX_ATTEMPTS = 5;

/** Генерация, отправка и проверка одноразовых кодов (SMS/email). */
@Injectable()
export class OtpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly sms: SmsSender,
    private readonly email: EmailSender,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Сгенерировать код, сохранить хэш и отправить по каналу. */
  async request(channel: OtpChannel, target: string, purpose: OtpPurpose): Promise<void> {
    const length = this.config.get('OTP_LENGTH', { infer: true });
    const ttl = this.config.get('OTP_TTL', { infer: true });
    const code = this.generateCode(length);

    await this.prisma.otpCode.create({
      data: {
        channel,
        target,
        purpose,
        codeHash: this.crypto.hash(`${channel}:${target}:${code}`),
        expiresAt: new Date(Date.now() + ttl * 1000),
      },
    });

    const text = `Код для входа в D Hotels & Apartments: ${code}`;
    if (channel === OtpChannel.PHONE) {
      await this.sms.send(target, text);
    } else {
      await this.email.send({ to: target, subject: 'Код для входа', text });
    }
  }

  /**
   * Проверить код. Возвращает true при совпадении (код помечается использованным).
   * Превышение числа попыток инвалидирует код.
   */
  async verify(channel: OtpChannel, target: string, code: string): Promise<boolean> {
    const otp = await this.prisma.otpCode.findFirst({
      where: { channel, target, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) return false;

    if (otp.attempts >= MAX_ATTEMPTS) {
      await this.prisma.otpCode.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      });
      throw new BadRequestException('Превышено число попыток. Запросите новый код.');
    }

    const matches = otp.codeHash === this.crypto.hash(`${channel}:${target}:${code}`);
    await this.prisma.otpCode.update({
      where: { id: otp.id },
      data: matches ? { consumedAt: new Date() } : { attempts: { increment: 1 } },
    });
    return matches;
  }

  private generateCode(length: number): string {
    const max = 10 ** length;
    return randomInt(0, max).toString().padStart(length, '0');
  }
}
