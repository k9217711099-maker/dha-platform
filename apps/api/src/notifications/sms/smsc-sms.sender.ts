import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsSender } from './sms.port.js';
import type { Env } from '../../config/env.schema.js';

/**
 * Адаптер SMSC.ru (российский SMS-провайдер). Базовая реализация HTTP API;
 * требует SMS_API_LOGIN / SMS_API_PASSWORD.
 */
@Injectable()
export class SmscSmsSender extends SmsSender {
  private readonly logger = new Logger('SmscSmsSender');

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
  }

  async send(to: string, message: string): Promise<void> {
    const login = this.config.get('SMS_API_LOGIN', { infer: true });
    const password = this.config.get('SMS_API_PASSWORD', { infer: true });
    if (!login || !password) {
      throw new Error('SMSC: не заданы SMS_API_LOGIN / SMS_API_PASSWORD');
    }

    const params = new URLSearchParams({
      login,
      psw: password,
      phones: to,
      mes: message,
      fmt: '3', // JSON-ответ
      charset: 'utf-8',
    });

    const res = await fetch(`https://smsc.ru/sys/send.php?${params.toString()}`);
    const data = (await res.json()) as { error?: string; id?: number };
    if (data.error) {
      this.logger.error(`SMSC ошибка: ${data.error}`);
      throw new Error(`SMSC: ${data.error}`);
    }
  }
}
