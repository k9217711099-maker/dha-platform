import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentGuestId } from '../auth/current-guest.decorator.js';
import { ChatService } from './chat.service.js';
import { SendMessageDto, StaffReplyDto } from './dto/chat.dto.js';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'История чата с ресепшен' })
  history(@CurrentGuestId() guestId: string) {
    return this.chat.history(guestId);
  }

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Отправить сообщение в поддержку' })
  send(@CurrentGuestId() guestId: string, @Body() dto: SendMessageDto) {
    return this.chat.send(guestId, dto.text, dto.topic);
  }

  // Входящий webhook от Bitrix24 (ответ сотрудника). TODO(прод): проверка подписи.
  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Ответ сотрудника из Bitrix24 (webhook)' })
  async webhook(@Body() dto: StaffReplyDto): Promise<{ ok: true }> {
    await this.chat.receiveStaffReply(dto.guestId, dto.text);
    return { ok: true };
  }
}
