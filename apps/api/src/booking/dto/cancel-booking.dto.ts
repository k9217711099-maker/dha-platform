import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelBookingDto {
  @ApiPropertyOptional({ description: 'Причина отмены' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
