import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString } from 'class-validator';

export class PasscodeDto {
  @ApiProperty()
  @IsString()
  ttlockLockId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Свой PIN (только в режиме add)' })
  @IsOptional()
  @IsString()
  pin?: string;

  @ApiProperty({ description: 'Начало действия, ms epoch' })
  @Type(() => Number)
  @IsInt()
  startMs!: number;

  @ApiProperty({ description: 'Окончание, ms epoch' })
  @Type(() => Number)
  @IsInt()
  endMs!: number;

  @ApiPropertyOptional({ enum: ['get', 'add'] })
  @IsOptional()
  @IsIn(['get', 'add'])
  mode?: 'get' | 'add';
}

export class EkeyDto {
  @ApiProperty()
  @IsString()
  ttlockLockId!: string;

  @ApiProperty({ description: 'Аккаунт получателя в TTLock' })
  @IsString()
  receiverUsername!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  startMs!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  endMs!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class TtlockUnlockDto {
  @ApiProperty()
  @IsString()
  ttlockLockId!: string;
}

export class TtlockCredsDto {
  @ApiProperty()
  @IsString()
  username!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string;
}
