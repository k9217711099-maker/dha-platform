import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentGuestId } from '../auth/current-guest.decorator.js';
import { LoyaltyService } from './loyalty.service.js';

@ApiTags('loyalty')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('loyalty')
export class LoyaltyController {
  constructor(private readonly loyalty: LoyaltyService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Сводка лояльности: уровень, баллы, прогресс, история' })
  getSummary(@CurrentGuestId() guestId: string) {
    return this.loyalty.getSummary(guestId);
  }
}
