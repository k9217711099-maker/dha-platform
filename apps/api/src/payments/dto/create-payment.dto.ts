import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CreatePaymentDto {
  @ApiProperty({ description: 'ID бронирования' })
  @IsString()
  bookingId!: string;
}
