import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Сообщение сотрудника AI-копилоту (админ-панель). */
export class CopilotMessageDto {
  @ApiPropertyOptional({ description: 'ID диалога; если не задан — начнётся новый' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiProperty({ description: 'Текст сообщения сотрудника' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}
