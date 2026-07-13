import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectCheckinDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ description: 'true — требуется исправление (NEEDS_FIX), иначе отклонено' })
  @IsOptional()
  @IsBoolean()
  needsFix?: boolean;
}
