import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';
import { BspbConfigService } from '../../integrations/bspb/bspb-config.service.js';
import { HttpBspbAdapter } from '../../integrations/bspb/http-bspb.adapter.js';
import type { BspbPingResult } from '../../integrations/bspb/http-bspb.adapter.js';
import { PaykeeperConfigService } from '../../integrations/paykeeper/paykeeper-config.service.js';
import { HttpPaykeeperAdapter } from '../../integrations/paykeeper/http-paykeeper.adapter.js';
import type { PaykeeperPingResult } from '../../integrations/paykeeper/http-paykeeper.adapter.js';
import { YooKassaConfigService } from '../../integrations/yookassa/yookassa-config.service.js';
import { HttpYooKassaAdapter } from '../../integrations/yookassa/http-yookassa.adapter.js';
import type { YooKassaPingResult } from '../../integrations/yookassa/http-yookassa.adapter.js';
import type { Env } from '../../config/env.schema.js';
import {
  ALL_PAYMENT_METHODS,
  PAYMENT_METHODS_KEY,
  parsePaymentMethods,
  serializePaymentMethods,
} from '../../common/payments/payment-methods.js';
import type { SaveBspbConfigDto, SavePaykeeperConfigDto, SaveYookassaConfigDto, TestBspbConnectionDto, TestPaykeeperConnectionDto, TestYookassaConnectionDto, ToggleIntegrationDto, UpsertLegalEntityDto } from './dto/legal-entity.dto.js';

/** Полная конфигурация эквайринга БСПБ для админки (подключение + способы оплаты). */
export interface BspbAdminConfig {
  apiBase: string;
  merchantId: string;
  username: string;
  passwordSet: boolean;
  connected: boolean;
  methods: PaymentMethodsConfig;
}

/** Полная конфигурация PayKeeper для админки (подключение + способы оплаты). */
export interface PaykeeperAdminConfig {
  server: string;
  user: string;
  passwordSet: boolean;
  secretSet: boolean;
  connected: boolean;
  methods: PaymentMethodsConfig;
}

/** Полная конфигурация ЮKassa для админки (подключение + способы оплаты). */
export interface YookassaAdminConfig {
  shopId: string;
  secretKeySet: boolean;
  connected: boolean;
  methods: PaymentMethodsConfig;
}

/** Ключ Setting для флага «включено» платёжной интеграции. */
const enabledKey = (id: string) => `finance.integration.${id}.enabled`;

/** Настройка включённых способов оплаты (карты/СБП). */
export interface PaymentMethodsConfig {
  card: boolean;
  sbp: boolean;
}

/** Статус фискализации чеков (54-ФЗ). */
export interface FiscalStatus {
  /** Активный провайдер: none | mock | atol. */
  provider: string;
  /** Фискализация выполняется нашей системой (provider !== none). */
  enabled: boolean;
}

export interface FinanceIntegration {
  id: string;
  name: string;
  description: string;
  category: 'online' | 'fiscal' | 'accounting';
  /** Есть техническая связность (креды заданы) — false у заготовок. */
  connected: boolean;
  /** Включена владельцем (тумблер). */
  enabled: boolean;
  /** Доступна к настройке (false у будущих заготовок). */
  available: boolean;
}

/**
 * Финансы гостиницы (Настройки → Финансы): реквизиты организаций (для счетов и
 * гарантии брони), приём онлайн-оплаты (интеграции ПС), заготовки фискального
 * регистратора и 1С. Все изменения пишутся в журнал (AuditLog).
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
    private readonly bspb: BspbConfigService,
    private readonly bspbAdapter: HttpBspbAdapter,
    private readonly paykeeper: PaykeeperConfigService,
    private readonly paykeeperAdapter: HttpPaykeeperAdapter,
    private readonly yookassa: YooKassaConfigService,
    private readonly yookassaAdapter: HttpYooKassaAdapter,
  ) {}

  // ─── Реквизиты ───
  listLegalEntities(tenantId: string) {
    return this.prisma.legalEntity.findMany({ where: { tenantId }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
  }

  async createLegalEntity(tenantId: string, dto: UpsertLegalEntityDto, actorId?: string) {
    const entity = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.legalEntity.updateMany({ where: { tenantId }, data: { isDefault: false } });
      return tx.legalEntity.create({ data: { ...dto, tenantId } });
    });
    await this.audit.record({ tenantId, actorId, action: 'created', entity: 'LegalEntity', entityId: entity.id, payload: { name: entity.name } });
    return entity;
  }

  async updateLegalEntity(tenantId: string, id: string, dto: UpsertLegalEntityDto, actorId?: string) {
    await this.getLegalEntity(tenantId, id);
    const entity = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.legalEntity.updateMany({ where: { tenantId, id: { not: id } }, data: { isDefault: false } });
      return tx.legalEntity.update({ where: { id }, data: dto });
    });
    await this.audit.record({ tenantId, actorId, action: 'updated', entity: 'LegalEntity', entityId: id, payload: { name: entity.name } });
    return entity;
  }

  async deleteLegalEntity(tenantId: string, id: string, actorId?: string) {
    const entity = await this.getLegalEntity(tenantId, id);
    await this.prisma.legalEntity.delete({ where: { id } });
    await this.audit.record({ tenantId, actorId, action: 'deleted', entity: 'LegalEntity', entityId: id, payload: { name: entity.name } });
    return { ok: true };
  }

  private async getLegalEntity(tenantId: string, id: string) {
    const entity = await this.prisma.legalEntity.findFirst({ where: { id, tenantId } });
    if (!entity) throw new NotFoundException('Реквизиты не найдены');
    return entity;
  }

  /** Активный эквайер (PAYMENT_PROVIDER с фолбэком на YOOKASSA_PROVIDER). */
  private paymentProvider(): string {
    return (
      this.config.get('PAYMENT_PROVIDER', { infer: true }) ??
      (this.config.get('YOOKASSA_PROVIDER', { infer: true }) === 'yookassa' ? 'yookassa' : 'mock')
    );
  }

  // ─── Интеграции (приём онлайн-оплаты / фискализация / 1С) ───
  async listIntegrations(): Promise<FinanceIntegration[]> {
    const [yookassaConnected, bspbConnected, paykeeperConnected] = await Promise.all([
      this.yookassa.getPublicConfig().then((c) => c.connected),
      this.bspb.getPublicConfig().then((c) => c.connected),
      this.paykeeper.getPublicConfig().then((c) => c.connected),
    ]);
    const fiscal = this.getFiscalStatus();
    const base: Omit<FinanceIntegration, 'enabled'>[] = [
      { id: 'yookassa', name: 'ЮKassa', description: 'Приём онлайн-оплаты банковскими картами и СБП. Нажмите «Настроить» — введите shopId и секретный ключ из личного кабинета ЮKassa и выберите способы оплаты. Фискализация чеков (54-ФЗ) — на стороне ЮKassa.', category: 'online', connected: yookassaConnected, available: true },
      { id: 'bspb', name: 'Банк «Санкт-Петербург»', description: 'Интернет-эквайринг БСПБ: банковские карты (МИР/Visa/MC/UnionPay) и СБП. Нажмите «Настроить» — введите реквизиты подключения и выберите способы оплаты (можно оставить только СБП). Чек в ОФД эквайер не бьёт — включите фискализацию.', category: 'online', connected: bspbConnected, available: true },
      { id: 'paykeeper', name: 'PayKeeper', description: 'Приём онлайн-оплаты через PayKeeper: банковские карты и СБП. Нажмите «Настроить» — введите адрес ЛК, логин, пароль и секретное слово. PayKeeper формирует чек (54-ФЗ) сам. Способы оплаты также настраиваются в личном кабинете PayKeeper.', category: 'online', connected: paykeeperConnected, available: true },
      { id: 'fiscal', name: 'Онлайн-касса (54-ФЗ)', description: `Фискализация чеков через онлайн-кассу. Активный провайдер: ${fiscal.provider}. Нужна для эквайринга БСПБ, который сам чеки не формирует.`, category: 'fiscal', connected: fiscal.enabled, available: true },
      { id: '1c', name: '1С: Бухгалтерия', description: 'Выгрузка счетов, актов и оплат в 1С. Заготовка — появится позже.', category: 'accounting', connected: false, available: false },
    ];
    const settings = await this.prisma.setting.findMany({ where: { key: { in: base.map((b) => enabledKey(b.id)) } } });
    const byKey = new Map(settings.map((s) => [s.key, s.value]));
    return base.map((b) => ({
      ...b,
      enabled: byKey.has(enabledKey(b.id)) ? byKey.get(enabledKey(b.id)) === 'true' : b.connected,
    }));
  }

  async toggleIntegration(tenantId: string, id: string, dto: ToggleIntegrationDto, actorId?: string) {
    const integrations = await this.listIntegrations();
    const target = integrations.find((i) => i.id === id);
    if (!target) throw new NotFoundException('Интеграция не найдена');
    await this.prisma.setting.upsert({
      where: { key: enabledKey(id) },
      create: { key: enabledKey(id), value: String(dto.enabled) },
      update: { value: String(dto.enabled) },
    });
    await this.audit.record({ tenantId, actorId, action: 'updated', entity: 'FinanceIntegration', entityId: id, payload: { enabled: dto.enabled } });
    return this.listIntegrations();
  }

  // ─── Эквайринг БСПБ (подключение + способы оплаты) ───
  /** Текущий набор включённых способов оплаты. */
  private async getPaymentMethods(): Promise<PaymentMethodsConfig> {
    const s = await this.prisma.setting.findUnique({ where: { key: PAYMENT_METHODS_KEY } });
    const methods = parsePaymentMethods(s?.value);
    return { card: methods.includes('card'), sbp: methods.includes('sbp') };
  }

  /** Полная конфигурация БСПБ для окна «Настроить» (без пароля). */
  async getBspbConfig(): Promise<BspbAdminConfig> {
    const [pub, methods] = await Promise.all([this.bspb.getPublicConfig(), this.getPaymentMethods()]);
    return { ...pub, methods };
  }

  /** Сохранить реквизиты подключения БСПБ и способы оплаты одним действием. */
  async saveBspbConfig(tenantId: string, dto: SaveBspbConfigDto, actorId?: string): Promise<BspbAdminConfig> {
    const methods = ALL_PAYMENT_METHODS.filter((m) => (m === 'card' && dto.card) || (m === 'sbp' && dto.sbp));
    if (methods.length === 0) throw new BadRequestException('Нужно оставить хотя бы один способ оплаты');

    await this.bspb.save({ apiBase: dto.apiBase, merchantId: dto.merchantId, username: dto.username, password: dto.password });
    await this.prisma.setting.upsert({
      where: { key: PAYMENT_METHODS_KEY },
      create: { key: PAYMENT_METHODS_KEY, value: serializePaymentMethods(methods) },
      update: { value: serializePaymentMethods(methods) },
    });
    // В журнал — без секретов: только какие поля затронуты и способы оплаты.
    await this.audit.record({
      tenantId,
      actorId,
      action: 'updated',
      entity: 'FinanceIntegration',
      entityId: 'bspb',
      payload: { methods: methods.join(','), merchantId: dto.merchantId ?? '(без изменений)', passwordChanged: !!dto.password },
    });
    return this.getBspbConfig();
  }

  /** Проверить связь с БСПБ. overrides — значения из формы (до сохранения). */
  testBspbConnection(dto: TestBspbConnectionDto): Promise<BspbPingResult> {
    return this.bspbAdapter.ping(dto);
  }

  // ─── Эквайринг PayKeeper (подключение + способы оплаты) ───
  /** Полная конфигурация PayKeeper для окна «Настроить» (без секретов). */
  async getPaykeeperConfig(): Promise<PaykeeperAdminConfig> {
    const [pub, methods] = await Promise.all([this.paykeeper.getPublicConfig(), this.getPaymentMethods()]);
    return { ...pub, methods };
  }

  /** Сохранить реквизиты PayKeeper и способы оплаты одним действием. */
  async savePaykeeperConfig(tenantId: string, dto: SavePaykeeperConfigDto, actorId?: string): Promise<PaykeeperAdminConfig> {
    const methods = ALL_PAYMENT_METHODS.filter((m) => (m === 'card' && dto.card) || (m === 'sbp' && dto.sbp));
    if (methods.length === 0) throw new BadRequestException('Нужно оставить хотя бы один способ оплаты');

    await this.paykeeper.save({ server: dto.server, user: dto.user, password: dto.password, secret: dto.secret });
    await this.prisma.setting.upsert({
      where: { key: PAYMENT_METHODS_KEY },
      create: { key: PAYMENT_METHODS_KEY, value: serializePaymentMethods(methods) },
      update: { value: serializePaymentMethods(methods) },
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'updated',
      entity: 'FinanceIntegration',
      entityId: 'paykeeper',
      payload: { methods: methods.join(','), server: dto.server ?? '(без изменений)', passwordChanged: !!dto.password, secretChanged: !!dto.secret },
    });
    return this.getPaykeeperConfig();
  }

  /** Проверить связь с PayKeeper. overrides — значения из формы (до сохранения). */
  testPaykeeperConnection(dto: TestPaykeeperConnectionDto): Promise<PaykeeperPingResult> {
    return this.paykeeperAdapter.ping(dto);
  }

  // ─── Эквайринг ЮKassa (подключение + способы оплаты) ───
  /** Полная конфигурация ЮKassa для окна «Настроить» (без секретного ключа). */
  async getYookassaConfig(): Promise<YookassaAdminConfig> {
    const [pub, methods] = await Promise.all([this.yookassa.getPublicConfig(), this.getPaymentMethods()]);
    return { ...pub, methods };
  }

  /** Сохранить реквизиты ЮKassa и способы оплаты одним действием. */
  async saveYookassaConfig(tenantId: string, dto: SaveYookassaConfigDto, actorId?: string): Promise<YookassaAdminConfig> {
    const methods = ALL_PAYMENT_METHODS.filter((m) => (m === 'card' && dto.card) || (m === 'sbp' && dto.sbp));
    if (methods.length === 0) throw new BadRequestException('Нужно оставить хотя бы один способ оплаты');

    await this.yookassa.save({ shopId: dto.shopId, secretKey: dto.secretKey });
    await this.prisma.setting.upsert({
      where: { key: PAYMENT_METHODS_KEY },
      create: { key: PAYMENT_METHODS_KEY, value: serializePaymentMethods(methods) },
      update: { value: serializePaymentMethods(methods) },
    });
    await this.audit.record({
      tenantId,
      actorId,
      action: 'updated',
      entity: 'FinanceIntegration',
      entityId: 'yookassa',
      payload: { methods: methods.join(','), shopId: dto.shopId ?? '(без изменений)', secretKeyChanged: !!dto.secretKey },
    });
    return this.getYookassaConfig();
  }

  /** Проверить связь с ЮKassa. overrides — значения из формы (до сохранения). */
  testYookassaConnection(dto: TestYookassaConnectionDto): Promise<YooKassaPingResult> {
    return this.yookassaAdapter.ping(dto);
  }

  /**
   * Доступные платёжные системы для онлайн-ссылки (вкладка «Счёт» → выбор ПС).
   * Включённые интеграции категории online + отметка активного эквайера и способы оплаты.
   */
  async listPaymentSystems(): Promise<{ id: string; name: string; active: boolean; methods: PaymentMethodsConfig }[]> {
    const [integrations, methods] = await Promise.all([this.listIntegrations(), this.getPaymentMethods()]);
    const active = this.paymentProvider();
    return integrations
      .filter((i) => i.category === 'online' && i.enabled)
      .map((i) => ({ id: i.id, name: i.name, active: i.id === active, methods }));
  }

  // ─── Фискализация ───
  getFiscalStatus(): FiscalStatus {
    const provider = this.config.get('FISCAL_PROVIDER', { infer: true });
    return { provider, enabled: provider !== 'none' };
  }

  // ─── Журнал изменений финансов ───
  auditJournal(take = 100) {
    return this.prisma.auditLog.findMany({
      where: { entity: { in: ['LegalEntity', 'FinanceIntegration'] } },
      orderBy: { at: 'desc' },
      take,
    });
  }
}
