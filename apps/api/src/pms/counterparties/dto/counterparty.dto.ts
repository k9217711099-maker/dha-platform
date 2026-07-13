import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString } from 'class-validator';

/** Контрагент-покупатель (агентство/компания) — справочник для счетов/актов. */
export class UpsertCounterpartyDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional({ enum: ['company', 'agency'] }) @IsOptional() @IsIn(['company', 'agency']) kind?: 'company' | 'agency';
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
  @ApiPropertyOptional({ description: 'Комиссия агентства, %' }) @IsOptional() @Type(() => Number) @IsInt() commission?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() note?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}
