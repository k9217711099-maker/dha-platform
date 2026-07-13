import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExtraUnit } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ExtraPeriodDto {
  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  from!: string;

  @ApiProperty({ example: '2026-08-31' })
  @IsDateString()
  until!: string;
}

export class CreateExtraDto {
  @ApiProperty({ example: 'Завтрак' })
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'Питание' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'URL картинки услуги' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ type: [ExtraPeriodDto], description: 'Периоды действия' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtraPeriodDto)
  periods?: ExtraPeriodDto[];

  @ApiPropertyOptional({ type: [String], description: 'ID категорий номеров (пусто — все)' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roomTypeIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Тарифы (kind), в которые услуга входит бесплатно' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includedRatePlanKinds?: string[];

  @ApiProperty({ example: 800, description: 'Цена за единицу, ₽' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price!: number;

  @ApiProperty({ enum: ExtraUnit })
  @IsEnum(ExtraUnit)
  unit!: ExtraUnit;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  quantitySelectable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateExtraDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ type: [ExtraPeriodDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtraPeriodDto)
  periods?: ExtraPeriodDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roomTypeIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  includedRatePlanKinds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ enum: ExtraUnit })
  @IsOptional()
  @IsEnum(ExtraUnit)
  unit?: ExtraUnit;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxQty?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  quantitySelectable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
