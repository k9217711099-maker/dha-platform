import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LockCoverage, LockTarget, LoyaltyTier, PromocodeType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AdminLoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  password!: string;
}

export class ManualPointsDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @ApiProperty()
  @IsString()
  comment!: string;
}

export class AdjustTierDto {
  @ApiProperty({ enum: LoyaltyTier })
  @IsEnum(LoyaltyTier)
  tier!: LoyaltyTier;
}

export class CreatePromocodeDto {
  @ApiProperty()
  @IsString()
  code!: string;

  @ApiProperty({ enum: PromocodeType })
  @IsEnum(PromocodeType)
  type!: PromocodeType;

  @ApiProperty({ description: 'Проценты (1..100) или сумма ₽' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  value!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  validUntil?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxUses?: number;
}

export class CreateLockDto {
  @ApiProperty()
  @IsString()
  propertyId!: string;

  @ApiProperty({ description: 'ID замка в TTLock' })
  @IsString()
  ttlockLockId!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty({ enum: LockTarget })
  @IsEnum(LockTarget)
  target!: LockTarget;

  @ApiPropertyOptional({ enum: LockCoverage, description: 'Зона покрытия (по умолчанию по типу двери)' })
  @IsOptional()
  @IsEnum(LockCoverage)
  coverage?: LockCoverage;

  @ApiPropertyOptional({ description: 'Этаж покрытия (Room.floor), когда coverage=FLOOR' })
  @IsOptional()
  @IsString()
  coverageFloor?: string;

  @ApiPropertyOptional({ description: 'Номера (ID) для coverage ROOM/ROOM_LIST' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roomIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasGateway?: boolean;
}

/** Изменить зону покрытия замка. */
export class LockCoverageDto {
  @ApiProperty({ enum: LockCoverage })
  @IsEnum(LockCoverage)
  coverage!: LockCoverage;

  @ApiPropertyOptional({ description: 'Этаж (Room.floor), когда coverage=FLOOR' })
  @IsOptional()
  @IsString()
  coverageFloor?: string;

  @ApiPropertyOptional({ description: 'Номера (ID) для coverage ROOM/ROOM_LIST' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roomIds?: string[];
}

/** Привязать/отвязать один номер к замку. */
export class LinkLockDto {
  @ApiProperty()
  @IsString()
  roomId!: string;
}
