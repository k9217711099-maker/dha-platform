import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';

const uniqIds = (ids: Array<string | null | undefined>): string[] => [
  ...new Set(ids.filter((x): x is string => !!x)),
];

function guestLabel(g: {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
}): string {
  const fio = [g.lastName, g.firstName].filter(Boolean).join(' ').trim();
  return fio || g.phone || g.email || '';
}

/**
 * Резолвит id операторов/гостей в отображаемые имена для админ-панели (лента
 * эскалаций §4.7, QA-дашборд §5.7). Батч-запросы, чтобы не плодить N+1. Показ ФИО/
 * телефона гостя оператору — внутренний авторизованный доступ (право guest_inbox),
 * не путать с отправкой в модель (там ПДн маскируются, §8).
 */
@Injectable()
export class AiDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  /** id оператора → имя (name, иначе email). */
  async operators(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const list = uniqIds(ids);
    if (!list.length) return new Map();
    const rows = await this.prisma.adminUser.findMany({
      where: { id: { in: list } },
      select: { id: true, name: true, email: true },
    });
    return new Map(rows.map((r) => [r.id, r.name?.trim() || r.email]));
  }

  /** Активные сотрудники тенанта — цели делегирования диалога (§4.8). */
  async listOperators(tenantId: string): Promise<Array<{ id: string; name: string; role: string }>> {
    const rows = await this.prisma.adminUser.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true, email: true, role: true, roleKey: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name?.trim() || r.email,
      role: r.roleKey ?? String(r.role),
    }));
  }

  /** id гостя → имя (ФИО, иначе телефон/email). */
  async guests(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
    const list = uniqIds(ids);
    if (!list.length) return new Map();
    const rows = await this.prisma.guest.findMany({
      where: { id: { in: list } },
      select: { id: true, firstName: true, lastName: true, phone: true, email: true },
    });
    return new Map(rows.map((r) => [r.id, guestLabel(r)]));
  }
}
