import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** Ответ оператора гостю в эскалированном диалоге. */
export class InboxReplyDto {
  @ApiProperty({ description: 'Текст ответа гостю' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text!: string;
}
