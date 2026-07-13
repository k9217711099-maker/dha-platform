import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ChildDto {
  @ApiPropertyOptional({ example: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(17)
  age!: number;
}

export class PassportDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(20)
  series!: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(20)
  number!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuedBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  issuedDate?: string;
}

/** Сохранение черновика онлайн-регистрации (§8.2). */
export class SaveCheckinDto {
  @ApiPropertyOptional({ example: '15:00' })
  @IsOptional()
  @IsString()
  arrivalTime?: string;

  @ApiPropertyOptional({ example: '12:00' })
  @IsOptional()
  @IsString()
  departureTime?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  adults?: number;

  @ApiPropertyOptional({ type: [ChildDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChildDto)
  children?: ChildDto[];

  @ApiPropertyOptional({ type: PassportDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PassportDto)
  passport?: PassportDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  consentsSigned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  houseRulesAccepted?: boolean;
}
