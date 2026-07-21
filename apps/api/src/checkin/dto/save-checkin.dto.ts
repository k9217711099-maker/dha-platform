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

/**
 * Паспортные/регистрационные данные гостя — набор для уведомления о прибытии (МВД).
 * Все поля опциональны (черновик); хранится JSON'ом в Checkin.passportEncrypted.
 */
export class PassportDto {
  @ApiPropertyOptional({ description: 'Тип документа: passport_rf | foreign_passport | residence_permit | ...' })
  @IsOptional() @IsString() @MaxLength(40)
  docType?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  middleName?: string;

  @ApiPropertyOptional({ description: 'Дата рождения YYYY-MM-DD' })
  @IsOptional() @IsString() @MaxLength(20)
  birthDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200)
  birthPlace?: string;

  @ApiPropertyOptional({ description: 'Пол: M | F' })
  @IsOptional() @IsString() @MaxLength(10)
  sex?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  citizenship?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20)
  series?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20)
  number?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(300)
  issuedBy?: string;

  @ApiPropertyOptional({ description: 'Дата выдачи YYYY-MM-DD' })
  @IsOptional() @IsString() @MaxLength(20)
  issuedDate?: string;

  @ApiPropertyOptional({ description: 'Адрес постоянной регистрации (прописка)' })
  @IsOptional() @IsString() @MaxLength(300)
  registrationAddress?: string;
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
