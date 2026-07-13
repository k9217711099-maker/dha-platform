import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service.js';

/** Дефолтный арендатор платформы (пока единственный оператор — D H&A). */
export const DEFAULT_TENANT = { slug: 'dha', name: 'D Hotels & Apartments' } as const;

/**
 * Арендаторы (мультиарендность DHP). Пока один дефолтный tenant, но весь код
 * tenant-aware: сущности создаются/читаются в контексте tenantId. Глобальный сервис —
 * инжектится в auth/booking/catalog/warehouse для проставления tenantId.
 */
@Injectable()
export class TenantService {
  private cachedDefaultId: string | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** ID дефолтного арендатора. Идемпотентно создаёт при отсутствии; кэширует в памяти. */
  async getDefaultTenantId(): Promise<string> {
    if (this.cachedDefaultId) return this.cachedDefaultId;
    const tenant = await this.prisma.tenant.upsert({
      where: { slug: DEFAULT_TENANT.slug },
      create: { slug: DEFAULT_TENANT.slug, name: DEFAULT_TENANT.name },
      update: {},
    });
    this.cachedDefaultId = tenant.id;
    return tenant.id;
  }

  list() {
    return this.prisma.tenant.findMany({ orderBy: { createdAt: 'asc' } });
  }

  get(id: string) {
    return this.prisma.tenant.findUnique({ where: { id } });
  }
}
