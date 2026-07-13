import { Body, Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentGuestId } from '../auth/current-guest.decorator.js';
import { PaymentsService } from './payments.service.js';
import { CreatePaymentDto } from './dto/create-payment.dto.js';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Создать платёж по брони (чек 54-ФЗ)' })
  create(@CurrentGuestId() guestId: string, @Body() dto: CreatePaymentDto) {
    return this.payments.createForBooking(guestId, dto.bookingId);
  }

  @Post('group')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Создать один платёж на группу броней (мульти-номер)' })
  createGroup(@CurrentGuestId() guestId: string, @Body() body: { groupId: string }) {
    return this.payments.createForGroup(guestId, body.groupId);
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Webhook платёжного шлюза (публичный)' })
  async webhook(@Body() payload: Record<string, unknown>): Promise<{ ok: true }> {
    await this.payments.handleWebhook(payload);
    return { ok: true };
  }

  @Post(':id/simulate')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiOperation({ summary: 'Демо-оплата (только mock-провайдер)' })
  async simulate(@CurrentGuestId() guestId: string, @Param('id') id: string): Promise<void> {
    await this.payments.simulateSuccess(guestId, id);
  }

  @Post(':id/sync')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Синхронизировать статус платежа со шлюзом (фолбэк к webhook)' })
  sync(@CurrentGuestId() guestId: string, @Param('id') id: string) {
    return this.payments.syncStatus(guestId, id);
  }

  @Post(':id/refund')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @ApiOperation({ summary: 'Возврат средств по платежу' })
  async refund(@CurrentGuestId() guestId: string, @Param('id') id: string): Promise<void> {
    await this.payments.refund(guestId, id);
  }
}
