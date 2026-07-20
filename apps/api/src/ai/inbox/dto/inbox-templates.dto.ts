import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

/** Один быстрый шаблон ответа (вставляется по «/» в ленте эскалаций, #5). */
export class ReplyTemplateDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ description: 'Короткое название (для «/»-поиска)' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  title?: string;

  @ApiProperty({ description: 'Текст ответа' })
  @IsString()
  @MaxLength(4000)
  text!: string;
}

/** Полная замена списка шаблонов ответа оператора. */
export class InboxTemplatesDto {
  @ApiProperty({ type: [ReplyTemplateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReplyTemplateDto)
  templates!: ReplyTemplateDto[];
}
