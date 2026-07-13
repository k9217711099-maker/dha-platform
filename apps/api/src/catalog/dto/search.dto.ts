import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { District, PropertyType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Тело запроса поиска проживания (§6.2–6.3). */
export class SearchDto {
  @ApiProperty({ example: '2026-07-01' })
  @IsDateString()
  checkIn!: string;

  @ApiProperty({ example: '2026-07-03' })
  @IsDateString()
  checkOut!: string;

  @ApiPropertyOptional({ example: 2, description: 'Взрослые' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests?: number;

  @ApiPropertyOptional({ example: 1, description: 'Дети' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  children?: number;

  @ApiPropertyOptional({ enum: PropertyType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(PropertyType, { each: true })
  propertyTypes?: PropertyType[];

  @ApiPropertyOptional({ enum: District, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(District, { each: true })
  districts?: District[];

  @ApiPropertyOptional({ type: [String], description: 'Коды удобств' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Коды характеристик' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({ type: [String], example: ['p2', 'p3'], description: 'Коды ценовых диапазонов' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  priceRanges?: string[];
}
