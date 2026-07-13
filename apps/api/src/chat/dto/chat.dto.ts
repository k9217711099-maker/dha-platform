import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  text!: string;

  @ApiPropertyOptional({ description: 'Тема обращения' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  topic?: string;
}

export class StaffReplyDto {
  @ApiProperty()
  @IsString()
  guestId!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  text!: string;
}
