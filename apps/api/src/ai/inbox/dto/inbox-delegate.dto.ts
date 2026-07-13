import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Делегирование диалога другому сотруднику (§4.8). */
export class InboxDelegateDto {
  @ApiProperty({ description: 'Кому передать — id сотрудника' })
  @IsUUID()
  operatorId!: string;

  @ApiPropertyOptional({ description: 'Комментарий-контекст для нового ответственного' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
