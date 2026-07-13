import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

/** Начисление/корректировка баллов сотруднику (§7). */
export class AwardBonusDto {
  @ApiProperty({ description: 'Кому начислить (AdminUser.id)' })
  @IsString()
  userId!: string;

  @ApiPropertyOptional({ description: 'Критерий из каталога (StaffBonusRule.id); баллы берутся из него, если не задано points' })
  @IsOptional() @IsString()
  ruleId?: string;

  @ApiPropertyOptional({ description: 'Баллы (целое, может быть отрицательным — корректировка). Обязательно, если нет ruleId' })
  @IsOptional() @IsInt()
  points?: number;

  @ApiPropertyOptional({ description: 'Комментарий/обоснование (обязателен при свободном начислении без критерия)' })
  @IsOptional() @IsString()
  reason?: string;
}

/** Критерий начисления баллов (каталог «за что»). */
export class SaveBonusRuleDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ description: 'Баллы по умолчанию за критерий' }) @IsOptional() @IsInt() points?: number;
  @ApiPropertyOptional({ description: 'Ограничение по роли-доступу (Role.key); пусто — для всех' }) @IsOptional() @IsString() roleKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() order?: number;
}
