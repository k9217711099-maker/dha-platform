import { Injectable } from '@nestjs/common';
import { ChatDirection } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Bitrix24Port } from '../integrations/bitrix24/bitrix24.port.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/** Чат гостя с ресепшен (§10). Сообщения зеркалятся в открытую линию Bitrix24. */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bitrix: Bitrix24Port,
    private readonly notifications: NotificationsService,
  ) {}

  async history(guestId: string) {
    return this.prisma.chatMessage.findMany({
      where: { guestId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Отправить сообщение гостя → сохранить и передать в открытую линию Bitrix24. */
  async send(guestId: string, text: string, topic?: string) {
    const guest = await this.prisma.guest.findUnique({ where: { id: guestId } });
    const message = await this.prisma.chatMessage.create({
      data: { guestId, direction: ChatDirection.GUEST, text, topic },
    });

    const res = await this.bitrix
      .sendOpenLineMessage({ guestRef: guestId, contactId: guest?.bitrixContactId, text, topic })
      .catch(() => null);
    if (res) {
      await this.prisma.chatMessage.update({
        where: { id: message.id },
        data: { bitrixMessageId: res.messageId },
      });
    }
    return message;
  }

  /** Ответ сотрудника из Bitrix24 (webhook). */
  async receiveStaffReply(guestId: string, text: string) {
    const message = await this.prisma.chatMessage.create({
      data: { guestId, direction: ChatDirection.STAFF, text },
    });
    await this.notifications.notify(guestId, 'CHAT_REPLY');
    return message;
  }
}
