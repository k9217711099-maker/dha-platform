import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoomBlockType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Поиск доступности на даты (query). Дата выезда ночь не занимает. */
export class SearchAvailabilityDto {
  @ApiPropertyOptional() @IsOptional() @IsString() propertyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() roomTypeId?: string;
  @ApiProperty({ example: '2026-08-01' }) @IsDateString() checkIn!: string;
  @ApiProperty({ example: '2026-08-05' }) @IsDateString() checkOut!: string;
  @ApiPropertyOptional({ example: 2 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) guests?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) children?: number;
}

/** Создание инвентарного лока (временное удержание доступности). */
export class CreateLockDto {
  @ApiProperty() @IsString() propertyId!: string;
  @ApiProperty() @IsString() roomTypeId!: string;
  @ApiPropertyOptional({ description: 'Конкретный номер, если выбран' }) @IsOptional() @IsString() roomId?: string;
  @ApiProperty({ example: '2026-08-01' }) @IsDateString() checkIn!: string;
  @ApiProperty({ example: '2026-08-05' }) @IsDateString() checkOut!: string;
  @ApiPropertyOptional({ example: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) quantity?: number;
  @ApiPropertyOptional({ description: 'TTL лока в минутах (по умолчанию 15)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) ttlMinutes?: number;
}

/** Блокировка номера на даты (ручная/техническая). Период [from, to) — день `to` не занимает ночь. */
export class CreateBlockDto {
  @ApiProperty() @IsString() roomId!: string;
  @ApiPropertyOptional({ enum: RoomBlockType, description: 'По умолчанию MAINTENANCE' }) @IsOptional() @IsEnum(RoomBlockType) type?: RoomBlockType;
  @ApiProperty({ example: '2026-08-01' }) @IsDateString() from!: string;
  @ApiProperty({ example: '2026-08-03' }) @IsDateString() to!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}
