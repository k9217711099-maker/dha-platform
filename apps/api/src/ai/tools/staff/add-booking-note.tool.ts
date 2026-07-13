import { Injectable } from '@nestjs/common';
import { AgentTool, type ToolContext, type ToolResult } from '../agent-tool.js';
import { asString } from '../tool-args.util.js';
import { PrismaService } from '../../../common/prisma/prisma.service.js';

/**
 * Добавить служебную заметку к брони (инструмент копилота, право pms_bookings).
 * mutates=true → у копилота выполняется только после подтверждения сотрудника.
 */
@Injectable()
export class AddBookingNoteTool extends AgentTool {
  readonly name = 'add_booking_note';
  readonly description =
    'Добавить служебную заметку к брони по её номеру. Меняет данные — потребует подтверждения сотрудника.';
  override readonly requiredPermission = 'pms_bookings';
  override readonly mutates = true;
  readonly parameters = {
    type: 'object',
    properties: {
      bookingNumber: { type: 'string' },
      note: { type: 'string', description: 'Текст заметки' },
    },
    required: ['bookingNumber', 'note'],
    additionalProperties: false,
  };

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const number = asString(args.bookingNumber);
    const note = asString(args.note);
    if (!number || !note) return { content: 'Нужны номер брони и текст заметки.', isError: true };

    const booking = await this.prisma.booking.findFirst({
      where: { tenantId: ctx.tenantId, bookingNumber: number },
      select: { id: true, comment: true },
    });
    if (!booking) return { content: `Бронь ${number} не найдена.`, isError: true };

    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const appended = `${booking.comment ? `${booking.comment}\n` : ''}[${stamp} · сотрудник] ${note}`;
    await this.prisma.booking.update({ where: { id: booking.id }, data: { comment: appended } });
    return { content: `Заметка добавлена к брони ${number}.` };
  }
}
