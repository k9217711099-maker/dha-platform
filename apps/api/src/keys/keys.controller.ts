import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentGuestId } from '../auth/current-guest.decorator.js';
import { KeysService } from './keys.service.js';

class OpenDoorDto {
  @ApiProperty({ description: 'ID замка TTLock двери' })
  @IsString()
  lockId!: string;
}

@ApiTags('keys')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings/:bookingId/key')
export class KeysController {
  constructor(private readonly keys: KeysService) {}

  @Get()
  @ApiOperation({ summary: 'Состояние цифрового ключа и возможность выдачи' })
  get(@CurrentGuestId() guestId: string, @Param('bookingId') bookingId: string) {
    return this.keys.getForBooking(guestId, bookingId);
  }

  @Post()
  @ApiOperation({ summary: 'Выдать цифровой ключ (PIN) по правилам §9.3' })
  issue(@CurrentGuestId() guestId: string, @Param('bookingId') bookingId: string) {
    return this.keys.issue(guestId, bookingId);
  }

  @Post('open')
  @ApiOperation({ summary: 'Удалённо открыть дверь через шлюз (веб/приложение)' })
  open(
    @CurrentGuestId() guestId: string,
    @Param('bookingId') bookingId: string,
    @Body() dto: OpenDoorDto,
  ) {
    return this.keys.openDoor(guestId, bookingId, dto.lockId);
  }
}
