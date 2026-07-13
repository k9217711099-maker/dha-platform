import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Min } from 'class-validator';

/** Параметры запроса доступности (§6.2). */
export class AvailabilityQueryDto {
  @ApiPropertyOptional({ description: 'ID нашего объекта (необязательно)' })
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiProperty({ example: '2026-07-01', description: 'Дата заезда' })
  @IsDateString()
  checkIn!: string;

  @ApiProperty({ example: '2026-07-03', description: 'Дата выезда' })
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
}
