import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard, type AdminRequest } from '../admin/admin-auth.guard.js';
import { RequirePermission } from '../admin/require-permission.decorator.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { OpsPmService } from './ops-pm.service.js';
import { OpsSettingsService } from './ops-settings.service.js';
import {
  DndDto, DutyDto, SaveAutomationDto, SaveChecklistDto, SaveCleaningRuleDto, SaveCleaningStandardDto,
  SaveCleaningTypeDto, SavePmRuleDto, SaveRecurringDto, SaveSectionDto, SaveSlaPolicyDto, SaveTagDto,
  SaveTemplateDto, SaveWriteoffListDto, SaveZoneDto,
} from './dto/ops.dto.js';

/** Справочники и настройки модуля «Задачи и Уборка» (§12.2). */
@ApiTags('ops-settings')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/ops')
export class OpsSettingsController {
  constructor(
    private readonly settings: OpsSettingsService,
    private readonly pm: OpsPmService,
    private readonly tenant: TenantService,
  ) {}

  private tid() {
    return this.tenant.getDefaultTenantId();
  }

  // ── Режим модуля задач (workflow-ТЗ §10) ─────────────────────────────────
  /** Текущий режим (читают все — чтобы UI знал, что рендерить). */
  @Get('tasks-mode') @RequirePermission('ops_tasks')
  async tasksMode() { return { mode: await this.settings.getTasksMode(await this.tid()) }; }
  /** Переключить режим сети — только с правом настроек (владелец/управляющий). */
  @Put('tasks-mode') @RequirePermission('ops_settings')
  async setTasksMode(@Body() body: { mode: string }) { return this.settings.setTasksMode(await this.tid(), body.mode); }

  // ── Теги ─────────────────────────────────────────────────────────────────
  @Get('tags') @RequirePermission('ops_tasks')
  async tags(@Query('archived') archived?: string) { return this.settings.tags(await this.tid(), archived === '1'); }
  @Post('tags') @RequirePermission('ops_settings')
  async createTag(@Body() dto: SaveTagDto) { return this.settings.createTag(await this.tid(), dto); }
  @Patch('tags/:id') @RequirePermission('ops_settings')
  async updateTag(@Param('id') id: string, @Body() dto: Partial<SaveTagDto> & { archived?: boolean }) { return this.settings.updateTag(await this.tid(), id, dto); }

  // ── Чек-листы (конструктор — право ops_checklists) ──────────────────────
  @Get('checklists') @RequirePermission('ops_tasks')
  async checklists() { return this.settings.checklists(await this.tid()); }
  @Post('checklists') @RequirePermission('ops_checklists')
  async createChecklist(@Body() dto: SaveChecklistDto) { return this.settings.saveChecklist(await this.tid(), dto); }
  @Patch('checklists/:id') @RequirePermission('ops_checklists')
  async updateChecklist(@Param('id') id: string, @Body() dto: SaveChecklistDto) { return this.settings.saveChecklist(await this.tid(), dto, id); }
  @Delete('checklists/:id') @RequirePermission('ops_checklists')
  async archiveChecklist(@Param('id') id: string) { return this.settings.archiveChecklist(await this.tid(), id); }

  // ── Шаблоны ──────────────────────────────────────────────────────────────
  @Get('templates') @RequirePermission('ops_tasks')
  async templates() { return this.settings.templates(await this.tid()); }
  @Post('templates') @RequirePermission('ops_settings')
  async createTemplate(@Body() dto: SaveTemplateDto) { return this.settings.createTemplate(await this.tid(), dto); }
  @Patch('templates/:id') @RequirePermission('ops_settings')
  async updateTemplate(@Param('id') id: string, @Body() dto: SaveTemplateDto) { return this.settings.updateTemplate(await this.tid(), id, dto); }
  @Delete('templates/:id') @RequirePermission('ops_settings')
  async deleteTemplate(@Param('id') id: string) { await this.settings.deleteTemplate(await this.tid(), id); return { ok: true }; }

  /** Импорт шаблонов из CSV/Excel (формат TeamJet: Задача;Исполнители;Наблюдатель;Приоритет;Срок;Где;Теги). */
  @Post('templates/import') @RequirePermission('ops_settings')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async importTemplates(@UploadedFile() file: Express.Multer.File) {
    if (!file?.buffer) throw new BadRequestException('Файл не передан');
    return this.settings.importTemplates(await this.tid(), file.buffer);
  }

  // ── SLA-матрица (LQA) ────────────────────────────────────────────────────
  @Get('sla') @RequirePermission('ops_tasks')
  async sla() { return this.settings.slaPolicies(await this.tid()); }
  @Post('sla') @RequirePermission('ops_settings')
  async saveSla(@Body() dto: SaveSlaPolicyDto) { return this.settings.saveSlaPolicy(await this.tid(), dto); }
  @Delete('sla/:id') @RequirePermission('ops_settings')
  async deleteSla(@Param('id') id: string) { await this.settings.deleteSlaPolicy(await this.tid(), id); return { ok: true }; }

  // ── ППР-циклы (LQA preventive maintenance) ───────────────────────────────
  @Get('pm-rules') @RequirePermission('ops_tasks')
  async pmRules() { return this.settings.pmRules(await this.tid()); }
  @Post('pm-rules') @RequirePermission('ops_settings')
  async createPmRule(@Body() dto: SavePmRuleDto) { return this.settings.createPmRule(await this.tid(), dto); }
  @Patch('pm-rules/:id') @RequirePermission('ops_settings')
  async updatePmRule(@Param('id') id: string, @Body() dto: Partial<SavePmRuleDto>) { return this.settings.updatePmRule(await this.tid(), id, dto); }
  @Delete('pm-rules/:id') @RequirePermission('ops_settings')
  async deletePmRule(@Param('id') id: string) { await this.settings.deletePmRule(await this.tid(), id); return { ok: true }; }
  /** Сгенерировать порцию ППР-задач сейчас (не дожидаясь ночного cron). */
  @Post('pm-rules/generate') @RequirePermission('ops_settings')
  async generatePm(@Body() body: { ruleId?: string }) { return this.pm.generate(await this.tid(), body.ruleId); }

  // ── Планировщик ──────────────────────────────────────────────────────────
  @Get('recurring') @RequirePermission('ops_tasks')
  async recurring() { return this.settings.recurring(await this.tid()); }
  @Post('recurring') @RequirePermission('ops_settings')
  async createRecurring(@Body() dto: SaveRecurringDto) { return this.settings.createRecurring(await this.tid(), dto); }
  @Patch('recurring/:id') @RequirePermission('ops_settings')
  async updateRecurring(@Param('id') id: string, @Body() dto: Partial<SaveRecurringDto>) { return this.settings.updateRecurring(await this.tid(), id, dto); }
  @Delete('recurring/:id') @RequirePermission('ops_settings')
  async deleteRecurring(@Param('id') id: string) { await this.settings.deleteRecurring(await this.tid(), id); return { ok: true }; }

  // ── Автоматизация ────────────────────────────────────────────────────────
  @Get('automation') @RequirePermission('ops_settings')
  async automation() { return this.settings.automation(await this.tid()); }
  @Post('automation') @RequirePermission('ops_settings')
  async createAutomation(@Body() dto: SaveAutomationDto) { return this.settings.createAutomation(await this.tid(), dto); }
  @Patch('automation/:id') @RequirePermission('ops_settings')
  async updateAutomation(@Param('id') id: string, @Body() dto: Partial<SaveAutomationDto>) { return this.settings.updateAutomation(await this.tid(), id, dto); }
  @Delete('automation/:id') @RequirePermission('ops_settings')
  async deleteAutomation(@Param('id') id: string) { await this.settings.deleteAutomation(await this.tid(), id); return { ok: true }; }

  // ── Типы, нормативы, правила уборок ──────────────────────────────────────
  @Get('cleaning/types') @RequirePermission('ops_tasks')
  async cleaningTypes() { return this.settings.cleaningTypes(await this.tid()); }
  @Post('cleaning/types') @RequirePermission('ops_settings')
  async createCleaningType(@Body() dto: SaveCleaningTypeDto) { return this.settings.createCleaningType(await this.tid(), dto); }
  @Patch('cleaning/types/:id') @RequirePermission('ops_settings')
  async updateCleaningType(@Param('id') id: string, @Body() dto: Partial<SaveCleaningTypeDto> & { archived?: boolean }) { return this.settings.updateCleaningType(await this.tid(), id, dto); }

  @Get('cleaning/standards') @RequirePermission('ops_tasks')
  async standards() { return this.settings.standards(await this.tid()); }
  @Post('cleaning/standards') @RequirePermission('ops_settings')
  async saveStandard(@Body() dto: SaveCleaningStandardDto) { return this.settings.saveStandard(await this.tid(), dto); }
  @Delete('cleaning/standards/:id') @RequirePermission('ops_settings')
  async deleteStandard(@Param('id') id: string) { await this.settings.deleteStandard(await this.tid(), id); return { ok: true }; }

  @Get('cleaning/rules') @RequirePermission('ops_settings')
  async rules() { return this.settings.rules(await this.tid()); }
  @Post('cleaning/rules') @RequirePermission('ops_settings')
  async createRule(@Body() dto: SaveCleaningRuleDto) { return this.settings.createRule(await this.tid(), dto); }
  @Patch('cleaning/rules/:id') @RequirePermission('ops_settings')
  async updateRule(@Param('id') id: string, @Body() dto: Partial<SaveCleaningRuleDto>) { return this.settings.updateRule(await this.tid(), id, dto); }
  @Delete('cleaning/rules/:id') @RequirePermission('ops_settings')
  async deleteRule(@Param('id') id: string) { await this.settings.deleteRule(await this.tid(), id); return { ok: true }; }

  // ── Зоны и секции ────────────────────────────────────────────────────────
  @Get('zones') @RequirePermission('ops_tasks')
  async zones() { return this.settings.zones(await this.tid()); }
  @Post('zones') @RequirePermission('ops_settings')
  async createZone(@Body() dto: SaveZoneDto) { return this.settings.createZone(await this.tid(), dto); }
  @Patch('zones/:id') @RequirePermission('ops_settings')
  async updateZone(@Param('id') id: string, @Body() dto: Partial<SaveZoneDto> & { active?: boolean }) { return this.settings.updateZone(await this.tid(), id, dto); }
  @Get('sections') @RequirePermission('ops_tasks')
  async sections() { return this.settings.sections(await this.tid()); }
  @Post('sections') @RequirePermission('ops_settings')
  async createSection(@Body() dto: SaveSectionDto) { return this.settings.createSection(await this.tid(), dto); }
  @Delete('sections/:id') @RequirePermission('ops_settings')
  async deleteSection(@Param('id') id: string) { await this.settings.deleteSection(await this.tid(), id); return { ok: true }; }

  // ── Листы списания ───────────────────────────────────────────────────────
  @Get('cleaning/writeoff-lists') @RequirePermission('ops_tasks')
  async writeoffLists() { return this.settings.writeoffLists(await this.tid()); }
  @Post('cleaning/writeoff-lists') @RequirePermission('ops_settings')
  async createWriteoffList(@Body() dto: SaveWriteoffListDto) { return this.settings.createWriteoffList(await this.tid(), dto); }
  @Patch('cleaning/writeoff-lists/:id') @RequirePermission('ops_settings')
  async updateWriteoffList(@Param('id') id: string, @Body() dto: Partial<SaveWriteoffListDto>) { return this.settings.updateWriteoffList(await this.tid(), id, dto); }
  @Delete('cleaning/writeoff-lists/:id') @RequirePermission('ops_settings')
  async deleteWriteoffList(@Param('id') id: string) { await this.settings.deleteWriteoffList(await this.tid(), id); return { ok: true }; }

  // ── Персонал: список, «в смене» (§10) ────────────────────────────────────
  @Get('staff') @RequirePermission('ops_tasks')
  async staff() { return this.settings.staff(await this.tid()); }
  @Post('duty') @RequirePermission('ops_tasks')
  async duty(@Body() dto: DutyDto, @Req() req: AdminRequest) { return this.settings.setDuty(await this.tid(), req.adminId, dto.on); }
  @Post('staff/:id/duty') @RequirePermission('ops_manage')
  async dutyFor(@Param('id') id: string, @Body() dto: DutyDto) { return this.settings.setDuty(await this.tid(), id, dto.on); }

  // ── Отделы (UserGroup): для назначения задач на группу ──────────────────
  @Get('groups') @RequirePermission('ops_tasks')
  async groups() { return this.settings.groups(await this.tid()); }
  @Post('groups') @RequirePermission('ops_settings')
  async createGroup(@Body() body: { name: string; color?: string; headUserId?: string; parentId?: string }) { return this.settings.createGroup(await this.tid(), body); }
  @Patch('groups/:id') @RequirePermission('ops_settings')
  async updateGroup(@Param('id') id: string, @Body() body: { name?: string; color?: string; headUserId?: string | null; parentId?: string | null }) { return this.settings.updateGroup(await this.tid(), id, body); }
  @Delete('groups/:id') @RequirePermission('ops_settings')
  async deleteGroup(@Param('id') id: string) { await this.settings.deleteGroup(await this.tid(), id); return { ok: true }; }
  @Post('groups/:id/members') @RequirePermission('ops_settings')
  async addGroupMember(@Param('id') id: string, @Body() body: { userId: string }) { return this.settings.addGroupMember(await this.tid(), id, body.userId); }
  @Delete('groups/:id/members/:userId') @RequirePermission('ops_settings')
  async removeGroupMember(@Param('id') id: string, @Param('userId') userId: string) { await this.settings.removeGroupMember(await this.tid(), id, userId); return { ok: true }; }

  // ── DND / просьба уборки (§3.3) ──────────────────────────────────────────
  @Post('rooms/:id/dnd') @RequirePermission('ops_tasks')
  async dnd(@Param('id') id: string, @Body() dto: DndDto) { return this.settings.setDnd(await this.tid(), id, dto.until ?? null); }
  @Post('rooms/:id/clean-request') @RequirePermission('ops_tasks')
  async cleanRequest(@Param('id') id: string, @Body() body: { on?: boolean }) { return this.settings.setCleanRequest(await this.tid(), id, body.on ?? true); }
}
