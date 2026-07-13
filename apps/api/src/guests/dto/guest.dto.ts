import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** Обновление профиля гостя (§5.3). */
export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

  @ApiPropertyOptional({ example: '1990-05-20' })
  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @ApiPropertyOptional({ example: 'RU' })
  @IsOptional()
  @IsString()
  @MaxLength(2)
  citizenship?: string;
}

/** Обновление согласия на маркетинг (152-ФЗ). */
export class UpdateMarketingConsentDto {
  @ApiProperty()
  @IsBoolean()
  granted!: boolean;
}
