import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Переименование диалога в ленте эскалаций (#7). Пусто/пустая строка — сброс к дефолту. */
export class InboxRenameDto {
  @ApiProperty({ description: 'Название диалога (пусто — сбросить к дефолту)', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;
}
