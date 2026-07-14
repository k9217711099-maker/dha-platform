import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../../common/settings/settings.service.js';
import type { Env } from '../../config/env.schema.js';

/** Идентификаторы поддерживаемых эквайеров. */
export type PaymentProvider = 'mock' | 'yookassa' | 'bspb' | 'paykeeper';
const PROVIDERS: PaymentProvider[] = ['mock', 'yookassa', 'bspb', 'paykeeper'];

/** Ключ Setting для активного эквайринга (выбирается в админке). */
export const ACTIVE_PROVIDER_KEY = 'finance.payment.provider';

/**
 * Определяет активный платёжный шлюз. Раньше он задавался только в .env
 * (PAYMENT_PROVIDER), из-за чего «слетал» при передеплое и подключение из
 * админки не включало эквайер. Теперь источник истины — Setting (выбор в
 * админке), а env остаётся запасным значением.
 */
@Injectable()
export class PaymentProviderService {
  constructor(
    private readonly settings: SettingsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Активный эквайер: Setting поверх env (PAYMENT_PROVIDER → YOOKASSA_PROVIDER → mock). */
  async resolve(): Promise<PaymentProvider> {
    const saved = await this.settings.get(ACTIVE_PROVIDER_KEY);
    if (saved && PROVIDERS.includes(saved as PaymentProvider)) return saved as PaymentProvider;
    const explicit = this.config.get('PAYMENT_PROVIDER', { infer: true });
    if (explicit && PROVIDERS.includes(explicit as PaymentProvider)) return explicit as PaymentProvider;
    return this.config.get('YOOKASSA_PROVIDER', { infer: true }) === 'yookassa' ? 'yookassa' : 'mock';
  }

  /** Назначить активный эквайер (из админки). */
  async set(provider: PaymentProvider): Promise<void> {
    await this.settings.set(ACTIVE_PROVIDER_KEY, provider);
  }
}
