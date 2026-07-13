import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

/** Позиция счёта/акта: наименование, кол-во, цена, НДС. */
export class FinanceDocLineDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() qty?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiProperty({ description: 'Цена за единицу, ₽' }) @Type(() => Number) @IsInt() price!: number;
  @ApiPropertyOptional({ description: 'Ставка НДС, % (0 — без НДС)' }) @IsOptional() @Type(() => Number) @IsInt() vatRate?: number;
  @ApiProperty({ description: 'Сумма позиции, ₽' }) @Type(() => Number) @IsInt() amount!: number;
}

/** Создание счёта / квитанции / онлайн-оплаты / акта по брони. */
export class CreateFinanceDocDto {
  @ApiProperty({ enum: ['INVOICE', 'RECEIPT', 'ONLINE', 'ACT'] }) @IsIn(['INVOICE', 'RECEIPT', 'ONLINE', 'ACT']) docType!: 'INVOICE' | 'RECEIPT' | 'ONLINE' | 'ACT';
  @ApiPropertyOptional({ enum: ['individual', 'legal'] }) @IsOptional() @IsIn(['individual', 'legal']) buyerType?: 'individual' | 'legal';
  @ApiPropertyOptional() @IsOptional() @IsString() buyerName?: string;
  @ApiPropertyOptional({ description: 'ID юр. лица покупателя (из справочника реквизитов)' }) @IsOptional() @IsString() buyerLegalEntityId?: string;
  @ApiPropertyOptional({ description: 'ID нашего юр. лица (реквизиты)' }) @IsOptional() @IsString() ourLegalEntityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() message?: string;
  @ApiPropertyOptional({ description: 'Дата документа (акт/счёт), ISO' }) @IsOptional() @IsString() docDate?: string;
  @ApiPropertyOptional({ description: 'Оплата до, ISO (для счёта)' }) @IsOptional() @IsString() dueDate?: string;
  @ApiProperty({ type: [FinanceDocLineDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => FinanceDocLineDto) lines!: FinanceDocLineDto[];
}

/** Создание залога (обеспечительного платежа) по брони. */
export class CreateDepositDto {
  @ApiProperty({ enum: ['CARD_HOLD', 'MANUAL'] }) @IsIn(['CARD_HOLD', 'MANUAL']) type!: 'CARD_HOLD' | 'MANUAL';
  @ApiPropertyOptional({ enum: ['cash', 'card', 'transfer'], description: 'Способ для ручного залога' }) @IsOptional() @IsIn(['cash', 'card', 'transfer']) method?: 'cash' | 'card' | 'transfer';
  @ApiProperty({ description: 'Сумма залога, ₽' }) @Type(() => Number) @IsInt() @Min(1) amount!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
}

/** Разрешение залога при выезде: снять (release), удержать (capture), вернуть (refund). */
export class ResolveDepositDto {
  @ApiProperty({ enum: ['release', 'capture', 'refund'] }) @IsIn(['release', 'capture', 'refund']) action!: 'release' | 'capture' | 'refund';
  @ApiPropertyOptional({ description: 'Сумма удержания при capture, ₽ (по умолчанию весь залог)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) capturedAmount?: number;
}
