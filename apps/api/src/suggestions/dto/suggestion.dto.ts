import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { SuggestionStatus } from '@prisma/client';

/** Новая идея/пожелание по доработке системы (#1). */
export class CreateSuggestionDto {
  @ApiProperty({ description: 'Раздел/модуль системы' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  section!: string;

  @ApiProperty({ description: 'Описание идеи' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}

/** Смена статуса идеи. */
export class SetSuggestionStatusDto {
  @ApiProperty({ enum: SuggestionStatus })
  @IsEnum(SuggestionStatus)
  status!: SuggestionStatus;
}
