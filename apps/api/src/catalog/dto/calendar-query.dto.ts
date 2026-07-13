import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/** Параметры календаря цен/доступности (пикер дат, Travel Line-style). */
export class CalendarQueryDto {
  @ApiPropertyOptional({ description: 'ID нашего объекта (необязательно)' })
  @IsOptional()
  @IsUUID()
  propertyId?: string;

  @ApiPropertyOptional({ description: 'ID категории номера (необязательно)' })
  @IsOptional()
  @IsUUID()
  roomTypeId?: string;

  @ApiProperty({ example: '2026-07-01', description: 'Первый день диапазона' })
  @IsDateString()
  from!: string;

  @ApiPropertyOptional({ example: 62, description: 'Сколько дней вперёд (макс. 92)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(92)
  days?: number;

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
