import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

/** Реквизиты организации (Настройки → Финансы → Реквизиты). */
export class UpsertLegalEntityDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() legalName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() kpp?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ogrn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() legalAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() director?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() corrAccount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bik?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() signatureUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() stampUrl?: string;
  @ApiPropertyOptional({ description: 'Ставка НДС по умолчанию, % (0/10/20; не задано — «Без НДС»)' }) @IsOptional() @Type(() => Number) @IsInt() defaultVatRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

/** Переключить платёжную интеграцию (приём онлайн-оплаты). */
export class ToggleIntegrationDto {
  @ApiProperty() @IsBoolean() enabled!: boolean;
}

/**
 * Конфигурация эквайринга БСПБ из окна «Настроить»: реквизиты подключения
 * (пароль — только на запись; пусто = оставить прежний) + способы оплаты.
 */
export class SaveBspbConfigDto {
  @ApiPropertyOptional({ description: 'URL платёжного шлюза (тест pgtest.bspb.ru, бой pg.bspb.ru)' })
  @IsOptional() @IsString() apiBase?: string;
  @ApiPropertyOptional({ description: 'Идентификатор мерчанта' }) @IsOptional() @IsString() merchantId?: string;
  @ApiPropertyOptional({ description: 'Логин API мерчанта' }) @IsOptional() @IsString() username?: string;
  @ApiPropertyOptional({ description: 'Пароль API (пусто — не менять)' }) @IsOptional() @IsString() password?: string;
  @ApiProperty({ description: 'Банковские карты (МИР/Visa/MC/UnionPay)' }) @IsBoolean() card!: boolean;
  @ApiProperty({ description: 'Система быстрых платежей (СБП)' }) @IsBoolean() sbp!: boolean;
}

/** Проверка подключения БСПБ значениями из формы (пусто → берутся сохранённые). */
export class TestBspbConnectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() apiBase?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() merchantId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() username?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() password?: string;
}

/**
 * Конфигурация PayKeeper из окна «Настроить»: реквизиты подключения (пароль и
 * секретное слово — только на запись; пусто = оставить прежние) + способы оплаты.
 */
export class SavePaykeeperConfigDto {
  @ApiPropertyOptional({ description: 'Адрес ЛК мерчанта (напр. https://demo.server.paykeeper.ru)' })
  @IsOptional() @IsString() server?: string;
  @ApiPropertyOptional({ description: 'Логин ЛК PayKeeper' }) @IsOptional() @IsString() user?: string;
  @ApiPropertyOptional({ description: 'Пароль ЛК (пусто — не менять)' }) @IsOptional() @IsString() password?: string;
  @ApiPropertyOptional({ description: 'Секретное слово для подписи callback (пусто — не менять)' }) @IsOptional() @IsString() secret?: string;
  @ApiProperty({ description: 'Банковские карты' }) @IsBoolean() card!: boolean;
  @ApiProperty({ description: 'Система быстрых платежей (СБП)' }) @IsBoolean() sbp!: boolean;
}

/** Проверка подключения PayKeeper значениями из формы (пусто → сохранённые). */
export class TestPaykeeperConnectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() server?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() user?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() password?: string;
}
