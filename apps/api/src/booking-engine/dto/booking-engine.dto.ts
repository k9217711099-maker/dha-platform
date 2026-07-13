import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingChannel } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Поиск предложений (публичный): доступность + тарифы на даты. */
export class SearchEngineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() propertyId?: string;
  @ApiProperty({ example: '2026-08-01' }) @IsDateString() checkIn!: string;
  @ApiProperty({ example: '2026-08-05' }) @IsDateString() checkOut!: string;
  @ApiPropertyOptional({ example: 2 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) guests?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) children?: number;
}

/** Расчёт цены выбранного варианта (guest): тариф + промокод + лояльность. */
export class QuoteEngineDto {
  @ApiProperty() @IsString() propertyId!: string;
  @ApiProperty() @IsString() roomTypeId!: string;
  @ApiProperty() @IsString() ratePlanId!: string;
  @ApiProperty({ example: '2026-08-01' }) @IsDateString() checkIn!: string;
  @ApiProperty({ example: '2026-08-05' }) @IsDateString() checkOut!: string;
  @ApiPropertyOptional({ example: 2 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) guests?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) children?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() promoCode?: string;
  @ApiPropertyOptional({ description: 'Сколько баллов гость хочет списать' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) pointsToRedeem?: number;
  @ApiPropertyOptional({ enum: BookingChannel }) @IsOptional() @IsEnum(BookingChannel) source?: BookingChannel;
}

/** Создание брони через Booking Engine (guest). Гость — из JWT; номер назначается при заезде. */
export class CreateEngineBookingDto {
  @ApiProperty() @IsString() propertyId!: string;
  @ApiProperty() @IsString() roomTypeId!: string;
  @ApiProperty() @IsString() ratePlanId!: string;
  @ApiProperty({ example: '2026-08-01' }) @IsDateString() checkIn!: string;
  @ApiProperty({ example: '2026-08-05' }) @IsDateString() checkOut!: string;
  @ApiProperty({ example: 2 }) @Type(() => Number) @IsInt() @Min(1) guests!: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) children?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() promoCode?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) pointsToRedeem?: number;
  @ApiPropertyOptional({ enum: BookingChannel }) @IsOptional() @IsEnum(BookingChannel) source?: BookingChannel;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}
