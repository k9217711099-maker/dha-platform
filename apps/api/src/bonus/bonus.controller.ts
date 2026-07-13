import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard, type AdminRequest } from '../admin/admin-auth.guard.js';
import { RequirePermission } from '../admin/require-permission.decorator.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { BonusService } from './bonus.service.js';
import { AwardBonusDto, SaveBonusRuleDto } from './dto/bonus.dto.js';

/**
 * Бонусная программа сотрудников (§7). Базовое право — `bonus_view` (свой баланс/история/рейтинг,
 * каталог критериев). Начисление и управление критериями — `bonus_award` (руководитель).
 */
@ApiTags('bonus')
@ApiBearerAuth()
@Controller('v1/bonus')
@UseGuards(AdminAuthGuard)
@RequirePermission('bonus_view')
export class BonusController {
  constructor(
    private readonly bonus: BonusService,
    private readonly tenant: TenantService,
  ) {}

  private tid() {
    return this.tenant.getDefaultTenantId();
  }

  @Get('me')
  @ApiOperation({ summary: 'Мои бонусы: баланс, за месяц, ранг, история, критерии, топ команды' })
  async me(@Req() req: AdminRequest) {
    return this.bonus.myOverview(await this.tid(), req.adminId);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Рейтинг команды по баллам (period=all|month)' })
  async leaderboard(@Query('period') period?: string) {
    return this.bonus.leaderboard(await this.tid(), period === 'month' ? 'month' : 'all');
  }

  @Get('rules')
  @ApiOperation({ summary: 'Каталог критериев начисления (за что дают баллы)' })
  async rules(@Query('activeOnly') activeOnly?: string) {
    return this.bonus.listRules(await this.tid(), { activeOnly: activeOnly === '1' || activeOnly === 'true' });
  }

  // --- Начисление и управление (bonus_award) ---

  @Get('recipients')
  @RequirePermission('bonus_award')
  @ApiOperation({ summary: 'Сотрудники для начисления баллов' })
  async recipients() {
    return this.bonus.recipients(await this.tid());
  }

  @Get('history')
  @RequirePermission('bonus_award')
  @ApiOperation({ summary: 'Журнал начислений (по сотруднику/периоду)' })
  async history(@Query('userId') userId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.bonus.history(await this.tid(), { userId, from, to, limit: 100 });
  }

  @Get('users/:id')
  @RequirePermission('bonus_award')
  @ApiOperation({ summary: 'Карточка бонусов сотрудника (баланс, ранг, история)' })
  async userCard(@Param('id') id: string) {
    return this.bonus.userCard(await this.tid(), id);
  }

  @Post('award')
  @RequirePermission('bonus_award')
  @ApiOperation({ summary: 'Начислить / скорректировать баллы сотруднику' })
  async award(@Body() dto: AwardBonusDto, @Req() req: AdminRequest) {
    return this.bonus.award(await this.tid(), req.adminId, dto);
  }

  @Post('rules')
  @RequirePermission('bonus_award')
  @ApiOperation({ summary: 'Создать критерий начисления' })
  async createRule(@Body() dto: SaveBonusRuleDto) {
    return this.bonus.createRule(await this.tid(), dto);
  }

  @Patch('rules/:id')
  @RequirePermission('bonus_award')
  @ApiOperation({ summary: 'Изменить критерий' })
  async updateRule(@Param('id') id: string, @Body() dto: SaveBonusRuleDto) {
    return this.bonus.updateRule(await this.tid(), id, dto);
  }

  @Delete('rules/:id')
  @RequirePermission('bonus_award')
  @ApiOperation({ summary: 'Удалить критерий' })
  async deleteRule(@Param('id') id: string) {
    return this.bonus.deleteRule(await this.tid(), id);
  }
}
