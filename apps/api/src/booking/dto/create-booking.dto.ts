import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingChannel } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/** Создание бронирования (§6.5). */
export class CreateBookingDto {
  @ApiProperty()
  @IsString()
  roomTypeId!: string;

  @ApiProperty({ description: 'ID тарифа из доступности' })
  @IsString()
  ratePlanId!: string;

  @ApiProperty({ example: '2026-07-01' })
  @IsDateString()
  checkIn!: string;

  @ApiProperty({ example: '2026-07-03' })
  @IsDateString()
  checkOut!: string;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests!: number;

  @ApiPropertyOptional({ example: 1, description: 'Сколько номеров этой категории (мульти-номер)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roomsCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  promoCode?: string;

  @ApiPropertyOptional({ description: 'Списать баллов (1 балл = 1 ₽)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pointsToRedeem?: number;

  @ApiPropertyOptional({ enum: BookingChannel, default: BookingChannel.WEBSITE })
  @IsOptional()
  @IsEnum(BookingChannel)
  channel?: BookingChannel;

  @ApiPropertyOptional({ description: 'ID группы броней (мульти-номер) — внутреннее' })
  @IsOptional()
  @IsString()
  groupId?: string;
}
