import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentGuestId } from '../auth/current-guest.decorator.js';
import { BookingService } from './booking.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { CreateBookingGroupDto } from './dto/create-booking-group.dto.js';
import { CancelBookingDto } from './dto/cancel-booking.dto.js';

@ApiTags('bookings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings')
export class BookingController {
  constructor(private readonly bookings: BookingService) {}

  @Post()
  @ApiOperation({ summary: 'Создать бронирование' })
  create(@CurrentGuestId() guestId: string, @Body() dto: CreateBookingDto) {
    return this.bookings.create(guestId, dto);
  }

  @Post('group')
  @ApiOperation({ summary: 'Групповое бронирование нескольких номеров (мульти-номер)' })
  createGroup(@CurrentGuestId() guestId: string, @Body() dto: CreateBookingGroupDto) {
    return this.bookings.createGroup(guestId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Мои бронирования (с разделом §7)' })
  list(@CurrentGuestId() guestId: string) {
    return this.bookings.list(guestId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Бронирование по id' })
  getOne(@CurrentGuestId() guestId: string, @Param('id') id: string) {
    return this.bookings.getOne(guestId, id);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Отменить бронирование (если разрешено тарифом)' })
  cancel(
    @CurrentGuestId() guestId: string,
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
  ) {
    return this.bookings.cancel(guestId, id, dto.reason);
  }
}
