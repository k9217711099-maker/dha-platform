import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingChannel } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/** Выбранная доп-услуга к позиции. */
export class ExtraSelectionDto {
  @ApiProperty()
  @IsString()
  extraId!: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  qty?: number;
}

/** Одна позиция группового бронирования (категория × кол-во). */
export class BookingGroupItemDto {
  @ApiProperty()
  @IsString()
  roomTypeId!: string;

  @ApiProperty()
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

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roomsCount?: number;

  @ApiPropertyOptional({ type: [ExtraSelectionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExtraSelectionDto)
  extras?: ExtraSelectionDto[];
}

/** Групповое бронирование нескольких номеров с общей оплатой (§ мульти-номер). */
export class CreateBookingGroupDto {
  @ApiProperty({ type: [BookingGroupItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BookingGroupItemDto)
  items!: BookingGroupItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  promoCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: 'Списать баллов — только если в группе один номер' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pointsToRedeem?: number;

  @ApiPropertyOptional({ enum: BookingChannel })
  @IsOptional()
  @IsEnum(BookingChannel)
  channel?: BookingChannel;
}
