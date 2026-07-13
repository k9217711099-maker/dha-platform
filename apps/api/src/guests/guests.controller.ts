import { Body, Controller, Get, Patch, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentGuestId } from '../auth/current-guest.decorator.js';
import { GuestsService } from './guests.service.js';
import { UpdateMarketingConsentDto, UpdateProfileDto } from './dto/guest.dto.js';

@ApiTags('guests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('guests')
export class GuestsController {
  constructor(private readonly guests: GuestsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Профиль текущего гостя' })
  getMe(@CurrentGuestId() guestId: string) {
    return this.guests.getProfile(guestId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Обновить профиль' })
  updateMe(@CurrentGuestId() guestId: string, @Body() dto: UpdateProfileDto) {
    return this.guests.updateProfile(guestId, dto);
  }

  @Put('me/consents/marketing')
  @ApiOperation({ summary: 'Обновить согласие на маркетинг' })
  updateMarketing(@CurrentGuestId() guestId: string, @Body() dto: UpdateMarketingConsentDto) {
    return this.guests.updateMarketingConsent(guestId, dto.granted);
  }
}
