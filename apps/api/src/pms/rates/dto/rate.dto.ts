import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RateAdjustmentType, RatePlanKind } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

/** Общая конфигурация тарифа (полная форма Bnovo) — база для создания и редактирования. */
export class RatePlanConfigDto {
  @ApiPropertyOptional({ enum: RatePlanKind }) @IsOptional() @IsEnum(RatePlanKind) kind?: RatePlanKind;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() refundable?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() availableFrontDesk?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() availableBookingModule?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() availableOta?: boolean;
  @ApiPropertyOptional({ description: 'Родительский тариф (для derived-цены)' }) @IsOptional() @IsString() parentRatePlanId?: string;
  @ApiPropertyOptional({ enum: RateAdjustmentType }) @IsOptional() @IsEnum(RateAdjustmentType) adjustmentType?: RateAdjustmentType;
  @ApiPropertyOptional({ description: 'Проценты (PERCENT, напр. −10) или ₽/ночь (FIXED, напр. 1500)' }) @IsOptional() @Type(() => Number) @IsInt() adjustmentValue?: number;
  @ApiPropertyOptional({ description: 'MANUAL | DERIVED' }) @IsOptional() @IsString() priceMode?: string;
  @ApiPropertyOptional({ description: 'Округление: NONE | INTEGER | TENS | FIFTIES | HUNDREDS' }) @IsOptional() @IsString() priceRounding?: string;
  @ApiPropertyOptional({ description: 'MANUAL | COPY' }) @IsOptional() @IsString() restrictionMode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultRestriction?: string;
  @ApiPropertyOptional({ type: 'array', description: 'Питание [{type, price}]' }) @IsOptional() @IsArray() meals?: unknown[];
  @ApiPropertyOptional({ type: 'array', description: 'Включённые услуги [{extraId, note}]' }) @IsOptional() @IsArray() includedServices?: unknown[];
  @ApiPropertyOptional({ description: 'FIXED | PERCENT | HOURLY' }) @IsOptional() @IsString() earlyLateMode?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() earlyLateApplyMain?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) freeCancelDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() cancellationComment?: string;
  @ApiPropertyOptional({ type: 'array', description: 'Периоды изменения правил [{from,to,freeCancelDays}]' }) @IsOptional() @IsArray() rulePeriods?: unknown[];
  @ApiPropertyOptional({ description: 'NONE | PREPAY' }) @IsOptional() @IsString() guaranteeType?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) releaseOpenDays?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) releaseOpenHours?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) releaseCloseDays?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) releaseCloseHours?: number;
  @ApiPropertyOptional({ description: 'Мин. ночей по умолчанию (ручное ограничение)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) defaultMinNights?: number;
  @ApiPropertyOptional({ type: [String], description: 'Категории, на которые действует ограничение по умолчанию' }) @IsOptional() @IsArray() @IsString({ each: true }) restrictionCategoryIds?: string[];
  @ApiPropertyOptional({ description: 'Конфиг раннего заезда/позднего выезда (процент от суток): {early:{percent,base}, late:{percent,base}}' }) @IsOptional() earlyLateConfig?: unknown;
  @ApiPropertyOptional({ description: 'Конфиг гарантии брони по аудиториям {individual,company,agency}' }) @IsOptional() guaranteeConfig?: unknown;
}

export class CreateRatePlanDto extends RatePlanConfigDto {
  @ApiPropertyOptional({ description: 'Объект. Пусто — сетевой тариф (все категории сети)' }) @IsOptional() @IsString() propertyId?: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ description: 'Уникальный код тарифа' }) @IsString() code!: string;
}

export class UpdateRatePlanDto extends RatePlanConfigDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
}

/** Массовая установка цены за ночь на диапазон дат [from, to). */
export class SetPricesDto {
  @ApiProperty() @IsString() ratePlanId!: string;
  @ApiProperty() @IsString() roomTypeId!: string;
  @ApiProperty({ example: '2026-08-01' }) @IsDateString() from!: string;
  @ApiProperty({ example: '2026-08-31' }) @IsDateString() to!: string;
  @ApiProperty({ example: 10000, description: 'Цена за ночь, ₽' }) @Type(() => Number) @IsInt() @Min(0) price!: number;
}

class PricePeriodDto {
  @ApiProperty({ example: '2026-08-01' }) @IsDateString() from!: string;
  @ApiProperty({ example: '2026-08-10' }) @IsDateString() to!: string;
}

/**
 * Массовое изменение цен на период(ы) (эталон Bnovo «Изменение цен на период»):
 * несколько периодов, набор категорий, фильтр по дням недели и режим изменения
 * (новое значение / увеличить-уменьшить на % или ₽).
 */
export class BulkPricesDto {
  @ApiProperty() @IsString() ratePlanId!: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsString({ each: true }) roomTypeIds!: string[];
  @ApiProperty({ type: [PricePeriodDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => PricePeriodDto) periods!: PricePeriodDto[];
  @ApiPropertyOptional({ type: [Number], description: 'Дни недели 0..6 (вс..сб). Пусто — все дни.' }) @IsOptional() @IsArray() @IsInt({ each: true }) weekdays?: number[];
  @ApiProperty({ enum: ['set', 'inc_pct', 'dec_pct', 'inc_abs', 'dec_abs'] }) @IsIn(['set', 'inc_pct', 'dec_pct', 'inc_abs', 'dec_abs']) mode!: 'set' | 'inc_pct' | 'dec_pct' | 'inc_abs' | 'dec_abs';
  @ApiProperty({ example: 10000 }) @Type(() => Number) @IsInt() @Min(0) value!: number;
}

/** Массовая установка ограничений на диапазон дат [from, to). Переданные поля перезаписываются. */
export class SetRestrictionsDto {
  @ApiProperty() @IsString() ratePlanId!: string;
  @ApiProperty() @IsString() roomTypeId!: string;
  @ApiProperty({ example: '2026-08-01' }) @IsDateString() from!: string;
  @ApiProperty({ example: '2026-08-31' }) @IsDateString() to!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) minStay?: number;
  @ApiPropertyOptional({ description: 'Мин. ночей на дату заезда' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) minStayArrival?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxStay?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() stopSell?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() closedToArrival?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() closedToDeparture?: boolean;
}

/**
 * Массовое обновление ограничений: N тарифов × M категорий × период × дни недели.
 * Продажи/Заезд/Выезд трёхпозиционны: undefined = «не менять», 'open'/'close' = открыть/закрыть.
 */
export class BulkRestrictionsDto {
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsString({ each: true }) ratePlanIds!: string[];
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMinSize(1) @IsString({ each: true }) roomTypeIds!: string[];
  @ApiProperty({ example: '2026-06-01' }) @IsDateString() from!: string;
  @ApiProperty({ example: '2026-06-30' }) @IsDateString() to!: string;
  @ApiPropertyOptional({ type: [Number], description: 'Дни недели (0=Вс…6=Сб); пусто = все дни' }) @IsOptional() @IsArray() @IsInt({ each: true }) weekdays?: number[];
  @ApiPropertyOptional({ enum: ['open', 'close'], description: 'Продажи: открыть/закрыть' }) @IsOptional() @IsIn(['open', 'close']) sales?: 'open' | 'close';
  @ApiPropertyOptional({ enum: ['open', 'close'], description: 'Заезд' }) @IsOptional() @IsIn(['open', 'close']) arrival?: 'open' | 'close';
  @ApiPropertyOptional({ enum: ['open', 'close'], description: 'Выезд' }) @IsOptional() @IsIn(['open', 'close']) departure?: 'open' | 'close';
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) minStay?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxStay?: number;
  @ApiPropertyOptional({ description: 'Мин. кол-во ночей на дату заезда' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) minStayArrival?: number;
}

/** Запрос расчёта цены (quote). */
export class QuoteQueryDto {
  @ApiProperty() @IsString() propertyId!: string;
  @ApiProperty() @IsString() roomTypeId!: string;
  @ApiProperty() @IsString() ratePlanId!: string;
  @ApiProperty({ example: '2026-08-01' }) @IsDateString() checkIn!: string;
  @ApiProperty({ example: '2026-08-05' }) @IsDateString() checkOut!: string;
  @ApiPropertyOptional({ example: 2 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) guests?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) children?: number;
}

export class CalendarQueryDto {
  @ApiProperty() @IsString() ratePlanId!: string;
  @ApiProperty() @IsString() roomTypeId!: string;
  @ApiProperty({ example: '2026-08-01' }) @IsDateString() from!: string;
  @ApiProperty({ example: '2026-08-31' }) @IsDateString() to!: string;
}
