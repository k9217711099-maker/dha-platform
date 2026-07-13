import { ApiPropertyOptional } from '@nestjs/swagger';
import { District, PropertyType } from '@prisma/client';
import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';

/** Фильтры просмотра каталога без дат (§6.3, кроме дат/цены). */
export class BrowseDto {
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

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}
