import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PromocodeApplication, PromocodeType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Промокод (полная форма, эталон Bnovo). Используется и для создания, и для редактирования. */
export class UpsertPromocodeDto {
  @ApiProperty() @IsString() code!: string;
  @ApiPropertyOptional({ description: 'Внутренний комментарий (гость не видит)' }) @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional({ enum: PromocodeType }) @IsOptional() @IsEnum(PromocodeType) type?: PromocodeType;
  @ApiProperty({ description: 'Размер скидки: % или ₽' }) @Type(() => Number) @IsInt() @Min(0) value!: number;
  @ApiPropertyOptional({ enum: PromocodeApplication }) @IsOptional() @IsEnum(PromocodeApplication) application?: PromocodeApplication;
  @ApiPropertyOptional({ description: 'Начало периода действия' }) @IsOptional() @IsDateString() validFrom?: string;
  @ApiPropertyOptional({ description: 'Конец периода действия' }) @IsOptional() @IsDateString() validUntil?: string;
  @ApiPropertyOptional({ description: 'Количество бронирований (лимит); пусто — без лимита' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxUses?: number;
  @ApiPropertyOptional({ type: [String], description: 'Категории (номера), к которым применим' }) @IsOptional() @IsArray() @IsString({ each: true }) roomTypeIds?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Тарифы, к которым применим' }) @IsOptional() @IsArray() @IsString({ each: true }) ratePlanIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showOnlyMatchingCategories?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showOnlyMatchingTariffs?: boolean;
  @ApiPropertyOptional({ description: 'Источник (модуль бронирования и пр.)' }) @IsOptional() @IsString() source?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bookingMethod?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referralSource?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() discountReason?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() autoApplyOnEmail?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ignoreRestrictions?: boolean;
  @ApiPropertyOptional({ description: 'Повышение категории: исходная категория' }) @IsOptional() @IsString() upgradeFromRoomTypeId?: string;
  @ApiPropertyOptional({ description: 'Повышение категории: целевая категория' }) @IsOptional() @IsString() upgradeToRoomTypeId?: string;
  @ApiPropertyOptional({ description: 'Бесплатная услуга: id доп-услуги (Extra)' }) @IsOptional() @IsString() freeExtraId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
