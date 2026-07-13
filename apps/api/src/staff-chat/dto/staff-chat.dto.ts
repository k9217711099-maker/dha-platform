import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Начать личный диалог (1:1). */
export class CreateDmDto {
  @ApiProperty({ description: 'id сотрудника-собеседника' })
  @IsUUID()
  userId!: string;
}

/** Создать групповой чат. */
export class CreateGroupDto {
  @ApiProperty({ description: 'Название группы' })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @ApiProperty({ type: [String], description: 'id участников (создатель добавляется сам)' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  memberIds!: string[];
}

/** Отправить сообщение в чат. */
export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;

  @ApiPropertyOptional({ description: 'id сообщения, на которое отвечаем (цитата)' })
  @IsOptional()
  @IsUUID()
  replyToId?: string;

  @ApiPropertyOptional({ type: [String], description: 'id упомянутых (@) участников' })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  mentionIds?: string[];
}

/** Реакция-эмодзи на сообщение. */
export class ReactDto {
  @ApiProperty({ description: 'Эмодзи' })
  @IsString()
  @MinLength(1)
  @MaxLength(16)
  emoji!: string;
}

/** Редактирование текста сообщения. */
export class EditMessageDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}

/** Создать папку-раздел. */
export class FolderCreateDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;
}

/** Изменить папку (переименовать / состав чатов / порядок). */
export class FolderUpdateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  chatIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

/** Настройки уведомлений в чате. */
export class NotifyDto {
  @ApiPropertyOptional({ enum: ['ALL', 'MENTIONS', 'NONE'] })
  @IsOptional()
  @IsIn(['ALL', 'MENTIONS', 'NONE'])
  mode?: 'ALL' | 'MENTIONS' | 'NONE';

  @ApiPropertyOptional({ description: 'Заглушить на N часов (0 — снять заглушку)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(168)
  muteHours?: number;
}
