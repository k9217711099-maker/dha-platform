import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AiChannel } from '@prisma/client';

/** Тело запроса гостя к AI-администратору (web/app-виджет). */
export class GuestMessageDto {
  @ApiPropertyOptional({ description: 'ID диалога; если не задан — начнётся новый' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiProperty({ description: 'Текст сообщения гостя' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;

  @ApiPropertyOptional({ enum: AiChannel, description: 'Канал (по умолчанию WEB)' })
  @IsOptional()
  @IsEnum(AiChannel)
  channel?: AiChannel;
}
