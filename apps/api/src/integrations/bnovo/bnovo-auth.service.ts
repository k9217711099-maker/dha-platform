import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { BnovoConfigService } from './bnovo-config.service.js';

/**
 * JWT-аутентификация Bnovo PMS (POST /api/v1/auth с { id, password }).
 * Токен живёт ~сутки; кэшируем и обновляем заранее или по 401 (invalidate()).
 * Реквизиты берутся динамически из BnovoConfigService (админка/Setting поверх env).
 */
@Injectable()
export class BnovoAuthService {
  private readonly logger = new Logger(BnovoAuthService.name);

  private token: string | null = null;
  private expiresAt = 0;
  private pending: Promise<string> | null = null;

  constructor(private readonly bnovoConfig: BnovoConfigService) {}

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
    const { baseUrl, accountId, apiKey } = await this.bnovoConfig.resolve();
    if (!accountId || !apiKey) {
      throw new ServiceUnavailableException('Bnovo не настроен: укажите ID аккаунта и ключ API в админке (Номерной фонд → Импорт из Bnovo) или в .env');
    }
    const res = await fetch(`${baseUrl}/api/v1/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: accountId, password: apiKey }),
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
