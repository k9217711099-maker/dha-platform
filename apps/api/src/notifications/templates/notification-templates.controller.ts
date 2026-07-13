import { Body, Controller, Delete, Get, Param, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { TenantService } from '../../pms/tenant/tenant.service.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { AuditService } from '../../warehouse/audit/audit.service.js';
import { SCENARIOS, type Scenario } from '../scenarios.js';
import { SCENARIO_META } from './scenario-meta.js';

const SCENARIO_KEYS = Object.keys(SCENARIOS);
const CHANNELS = ['*', 'PUSH', 'SMS', 'EMAIL', 'TELEGRAM'];

class UpsertTemplateDto {
  @IsIn(CHANNELS)
  channel!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(2000)
  body!: string;
}

/**
 * Реестр редактируемых шаблонов уведомлений (CHECK-IN-TZ §5.2). Дефолтные тексты
 * зашиты в scenarios.ts; переопределения — на тенант, канал '*' или конкретный.
 */
@ApiTags('notification-templates')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/notification-templates')
export class NotificationTemplatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenant: TenantService,
    private readonly audit: AuditService,
  ) {}

  /** Все сценарии: дефолтный текст (по sample) + переопределения + переменные. */
  @Get()
  @RequirePermission('notif_templates')
  async list() {
    const tenantId = await this.tenant.getDefaultTenantId();
    const overrides = await this.prisma.notificationTemplate.findMany({ where: { tenantId } });
    return SCENARIO_KEYS.map((key) => {
      const meta = SCENARIO_META[key as Scenario];
      const def = SCENARIOS[key as Scenario];
      return {
        scenario: key,
        label: meta.label,
        vars: meta.vars,
        sample: meta.sample,
        defaultChannels: def.channels,
        defaultText: def.render(meta.sample),
        overrides: overrides
          .filter((o) => o.scenario === key)
          .map((o) => ({ channel: o.channel, title: o.title, body: o.body })),
      };
    });
  }

  /** Создать/обновить переопределение шаблона (канал '*' или конкретный). */
  @Put(':scenario')
  @RequirePermission('notif_templates')
  async upsert(@Param('scenario') scenario: string, @Body() dto: UpsertTemplateDto) {
    if (!SCENARIO_KEYS.includes(scenario)) return { error: 'Неизвестный сценарий' };
    const tenantId = await this.tenant.getDefaultTenantId();
    const tpl = await this.prisma.notificationTemplate.upsert({
      where: { tenantId_scenario_channel: { tenantId, scenario, channel: dto.channel } },
      create: { tenantId, scenario, channel: dto.channel, title: dto.title, body: dto.body },
      update: { title: dto.title, body: dto.body },
    });
    await this.audit.record({ tenantId, action: 'notif_template_upserted', entity: 'NotificationTemplate', entityId: tpl.id, payload: { scenario, channel: dto.channel } });
    return tpl;
  }

  /** Сбросить переопределение (вернуться к встроенному тексту). */
  @Delete(':scenario/:channel')
  @RequirePermission('notif_templates')
  async reset(@Param('scenario') scenario: string, @Param('channel') channel: string) {
    const tenantId = await this.tenant.getDefaultTenantId();
    await this.prisma.notificationTemplate.deleteMany({ where: { tenantId, scenario, channel } });
    await this.audit.record({ tenantId, action: 'notif_template_reset', entity: 'NotificationTemplate', entityId: scenario, payload: { channel } });
    return { ok: true };
  }
}
