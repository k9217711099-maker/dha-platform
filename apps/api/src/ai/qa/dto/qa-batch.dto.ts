import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Параметры батч-разбора качества (§5.7). */
export class QaBatchDto {
  @ApiPropertyOptional({ description: 'Сколько диалогов разобрать за прогон (1..50)', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
