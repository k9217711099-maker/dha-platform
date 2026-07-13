import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentGuestId } from '../auth/current-guest.decorator.js';
import { NotificationsService } from './notifications.service.js';

class RegisterDeviceDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty({ enum: ['ios', 'android', 'web'] })
  @IsIn(['ios', 'android', 'web'])
  platform!: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Список уведомлений гостя' })
  list(@CurrentGuestId() guestId: string) {
    return this.notifications.list(guestId);
  }

  @Post('devices')
  @HttpCode(204)
  @ApiOperation({ summary: 'Зарегистрировать токен устройства для push' })
  async registerDevice(
    @CurrentGuestId() guestId: string,
    @Body() dto: RegisterDeviceDto,
  ): Promise<void> {
    await this.notifications.registerDevice(guestId, dto.token, dto.platform);
  }
}
