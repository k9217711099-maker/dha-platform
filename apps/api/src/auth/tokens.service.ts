import { randomBytes } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CryptoService } from '../common/crypto/crypto.service.js';
import type { Env } from '../config/env.schema.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Полезная нагрузка access-токена. */
export interface JwtPayload {
  sub: string;
}

/** Выпуск access-JWT и управление refresh-токенами (ротация/отзыв). */
@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issuePair(guestId: string): Promise<TokenPair> {
    const accessTtl = this.config.get('JWT_ACCESS_TTL', { infer: true });
    const refreshTtl = this.config.get('JWT_REFRESH_TTL', { infer: true });

    const accessToken = await this.jwt.signAsync(
      { sub: guestId } satisfies JwtPayload,
      { expiresIn: accessTtl },
    );

    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        guestId,
        tokenHash: this.crypto.hash(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken, expiresIn: accessTtl };
  }

  /** Ротация: проверяет refresh, отзывает его и выпускает новую пару. */
  async rotate(refreshToken: string): Promise<TokenPair> {
    const tokenHash = this.crypto.hash(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Недействительный refresh-токен');
    }
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issuePair(stored.guestId);
  }

  async revoke(refreshToken: string): Promise<void> {
    const tokenHash = this.crypto.hash(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
