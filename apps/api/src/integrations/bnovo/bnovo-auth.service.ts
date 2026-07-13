import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';

/**
 * JWT-аутентификация Bnovo PMS (POST /api/v1/auth с { id, password }).
 * Токен живёт ~сутки; кэшируем и обновляем заранее или по 401 (invalidate()).
 */
@Injectable()
export class BnovoAuthService {
  private readonly logger = new Logger(BnovoAuthService.name);
  private readonly baseUrl: string;
  private readonly accountId?: number;
  private readonly apiKey?: string;

  private token: string | null = null;
  private expiresAt = 0;
  private pending: Promise<string> | null = null;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get('BNOVO_API_BASE', { infer: true });
    this.accountId = config.get('BNOVO_ACCOUNT_ID', { infer: true });
    this.apiKey = config.get('BNOVO_API_KEY', { infer: true });
  }

  /** Действующий bearer-токен (из кэша или новая авторизация). */
  async getToken(force = false): Promise<string> {
    if (!force && this.token && Date.now() < this.expiresAt) return this.token;
    if (this.pending) return this.pending;
    this.pending = this.authenticate().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  private async authenticate(): Promise<string> {
    if (!this.accountId || !this.apiKey) {
      throw new ServiceUnavailableException('Bnovo не настроен: нужны BNOVO_ACCOUNT_ID и BNOVO_API_KEY');
    }
    const res = await fetch(`${this.baseUrl}/api/v1/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: this.accountId, password: this.apiKey }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ServiceUnavailableException(`Bnovo auth ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as { data?: { access_token?: string }; access_token?: string };
    const token = json.data?.access_token ?? json.access_token;
    if (!token) throw new ServiceUnavailableException('Bnovo auth: токен не получен');
    this.token = token;
    this.expiresAt = this.expFromJwt(token) ?? Date.now() + 23 * 3600 * 1000;
    this.logger.log('Получен JWT Bnovo');
    return token;
  }

  /** Срок действия из payload JWT (exp, секунды) минус минута запаса. */
  private expFromJwt(token: string): number | null {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64').toString('utf8')) as { exp?: number };
      return payload.exp ? payload.exp * 1000 - 60_000 : null;
    } catch {
      return null;
    }
  }
}
