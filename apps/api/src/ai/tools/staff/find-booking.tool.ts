import { Injectable } from '@nestjs/common';
import { AgentTool, type ToolContext, type ToolResult } from '../agent-tool.js';
import { asString } from '../tool-args.util.js';
import { PrismaService } from '../../../common/prisma/prisma.service.js';

/**
 * Поиск брони по номеру или имени гостя (инструмент копилота, право pms_bookings).
 * Только чтение. Возвращает обезличенную сводку — полные ПДн гостя в модель не идут.
 */
@Injectable()
export class FindBookingTool extends AgentTool {
  readonly name = 'find_booking';
  readonly description =
    'Найти бронь по номеру или имени гостя. Возвращает обезличенную сводку: номер, объект, категория, даты, статус.';
  override readonly requiredPermission = 'pms_bookings';
  readonly parameters = {
    type: 'object',
    properties: { query: { type: 'string', description: 'Номер брони или имя гостя' } },
    required: ['query'],
    additionalProperties: false,
  };

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async execute(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const query = asString(args.query);
    if (!query) return { content: 'Укажите номер брони или имя гостя.', isError: true };

    const rows = await this.prisma.booking.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [
          { bookingNumber: { contains: query, mode: 'insensitive' } },
          { guest: { firstName: { contains: query, mode: 'insensitive' } } },
          { guest: { lastName: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: { property: { select: { name: true } }, roomType: { select: { name: true } } },
      orderBy: { checkIn: 'desc' },
      take: 5,
    });
    if (rows.length === 0) return { content: `По запросу «${query}» броней не найдено.` };

    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const lines = rows.map(
      (b) =>
        `#${b.bookingNumber} · ${b.property.name} · ${b.roomType?.name ?? '—'} · ${iso(b.checkIn)}–${iso(b.checkOut)} · ${b.status}`,
    );
    return { content: lines.join('\n') };
  }
}
