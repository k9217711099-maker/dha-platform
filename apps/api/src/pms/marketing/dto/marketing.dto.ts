import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MarketingOptionKind } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';

export class CreateMarketingOptionDto {
  @ApiProperty({ enum: MarketingOptionKind }) @IsEnum(MarketingOptionKind) kind!: MarketingOptionKind;
  @ApiProperty() @IsString() label!: string;
}

export class UpdateMarketingOptionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}
