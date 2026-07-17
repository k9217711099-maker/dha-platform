import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FUNNEL_CHANNELS, FUNNEL_CONDITIONS, FUNNEL_PROTECTED_STAGE_KEYS, FUNNEL_STAGE_KEYS } from '@dha/domain';
import { SCENARIOS, type Scenario } from '../../notifications/scenarios.js';
import { SCENARIO_META } from '../../notifications/templates/scenario-meta.js';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { CurrentAdminId } from '../../admin/current-admin.decorator.js';
import { TenantService } from '../../pms/tenant/tenant.service.js';
import { TelegramConfigService } from '../../integrations/telegram/telegram-config.service.js';
import { MaxConfigService } from '../../integrations/max/max-config.service.js';
import { WhatsAppService } from '../../integrations/whatsapp/whatsapp.service.js';
import { UmnicoConfigService } from '../../integrations/umnico/umnico-config.service.js';
import { FunnelConfigService } from './funnel-config.service.js';
import { CreateStageDto, ReorderStagesDto, UpsertFunnelDto, UpsertStageDto } from './dto/funnel-config.dto.js';

/** Конструктор воронки заселения (CHECK-IN-TZ §2) — право checkin_funnel_manage. */
@ApiTags('checkin-funnel')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/checkin-funnels')
export class FunnelConfigController {
  constructor(
    private readonly config: FunnelConfigService,
    private readonly tenant: TenantService,
    private readonly telegram: TelegramConfigService,
    private readonly max: MaxConfigService,
    private readonly whatsapp: WhatsAppService,
    private readonly umnico: UmnicoConfigService,
  ) {}

  /** Словарь конструктора: условия, каналы, типовые этапы, шаблоны уведомлений (§2.1). */
  @Get('dictionary')
  @RequirePermission('checkin_funnel_manage')
  async dictionary() {
    // Каналы с флагом active: реально настроенные/подключённые подсвечиваются как
    // доступные, ненастроенные — приглушены (гость по ним не получит уведомление).
    const [tgConfigured, maxConfigured] = await Promise.all([this.telegram.hasToken(), this.max.hasToken()]);
    const waConnected = this.whatsapp.getState().status === 'connected';
    const active: Record<string, boolean> = {
      push: true, sms: true, email: true, guest_portal: true, ota_messaging: true,
      telegram: tgConfigured, whatsapp: waConnected, max: maxConfigured,
    };
    const channels: { key: string; label: string; active: boolean }[] = [
      ...FUNNEL_CHANNELS,
      { key: 'max', label: 'MAX' },
    ].map((c) => ({ ...c, active: active[c.key] ?? true }));
    // Каналы, подключённые в Umnico (WhatsApp/Telegram/VK/Avito): ключ umnico:<id>.
    for (const ch of await this.umnico.listChannels()) {
      channels.push({ key: `umnico:${ch.id}`, label: `Umnico · ${ch.label}`, active: ch.status === 'active' });
    }
    return {
      conditions: FUNNEL_CONDITIONS,
      channels,
      stageKeys: FUNNEL_STAGE_KEYS,
      protectedStageKeys: FUNNEL_PROTECTED_STAGE_KEYS,
      // Сценарии для выбора шаблона этапа + предпросмотр дефолтного текста (§5.2).
      templates: Object.keys(SCENARIOS).map((key) => {
        const meta = SCENARIO_META[key as Scenario];
        return { key, label: meta.label, preview: SCENARIOS[key as Scenario].render(meta.sample) };
      }),
    };
  }

  @Get()
  @RequirePermission('checkin_funnel_manage')
  async list() {
    return this.config.list(await this.tenant.getDefaultTenantId());
  }

  @Post()
  @RequirePermission('checkin_funnel_manage')
  async create(@Body() dto: UpsertFunnelDto, @CurrentAdminId() adminId: string) {
    return this.config.create(await this.tenant.getDefaultTenantId(), dto, adminId);
  }

  @Patch(':id')
  @RequirePermission('checkin_funnel_manage')
  async update(@Param('id') id: string, @Body() dto: UpsertFunnelDto, @CurrentAdminId() adminId: string) {
    return this.config.update(await this.tenant.getDefaultTenantId(), id, dto, adminId);
  }

  @Delete(':id')
  @RequirePermission('checkin_funnel_manage')
  async remove(@Param('id') id: string, @CurrentAdminId() adminId: string) {
    return this.config.remove(await this.tenant.getDefaultTenantId(), id, adminId);
  }

  @Post(':id/stages')
  @RequirePermission('checkin_funnel_manage')
  async createStage(@Param('id') id: string, @Body() dto: CreateStageDto, @CurrentAdminId() adminId: string) {
    return this.config.createStage(await this.tenant.getDefaultTenantId(), id, dto, adminId);
  }

  @Patch(':id/stages/:stageId')
  @RequirePermission('checkin_funnel_manage')
  async updateStage(
    @Param('id') id: string,
    @Param('stageId') stageId: string,
    @Body() dto: UpsertStageDto,
    @CurrentAdminId() adminId: string,
  ) {
    return this.config.updateStage(await this.tenant.getDefaultTenantId(), id, stageId, dto, adminId);
  }

  @Delete(':id/stages/:stageId')
  @RequirePermission('checkin_funnel_manage')
  async deleteStage(@Param('id') id: string, @Param('stageId') stageId: string, @CurrentAdminId() adminId: string) {
    return this.config.deleteStage(await this.tenant.getDefaultTenantId(), id, stageId, adminId);
  }

  @Post(':id/stages/reorder')
  @RequirePermission('checkin_funnel_manage')
  async reorder(@Param('id') id: string, @Body() dto: ReorderStagesDto, @CurrentAdminId() adminId: string) {
    return this.config.reorderStages(await this.tenant.getDefaultTenantId(), id, dto, adminId);
  }
}
