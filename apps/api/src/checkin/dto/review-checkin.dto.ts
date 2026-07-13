import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Возврат/отклонение регистрации сотрудником (§8.4). */
export class ReviewCheckinDto {
  @ApiProperty({ description: 'Причина возврата на исправление / отклонения' })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    description: 'true — вернуть на исправление (NEEDS_FIX); false — отклонить (REJECTED). По умолчанию true.',
  })
  @IsOptional()
  @IsBoolean()
  needsFix?: boolean;
}
