import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard, type AdminRequest } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { TenantService } from '../../pms/tenant/tenant.service.js';
import { CopilotAgentService } from './copilot-agent.service.js';
import { CopilotMessageDto } from './dto/copilot-message.dto.js';
import { CopilotConfirmDto } from './dto/copilot-confirm.dto.js';

/**
 * HTTP-вход AI-копилота сотрудника (админ-панель). Только под админ-токеном с правом
 * ai_copilot. Права роли (req.adminPerms) прокидываются в ToolContext — инструменты
 * гейтятся по ним. Действия на запись подтверждаются через /confirm.
 */
@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai/copilot')
@UseGuards(AdminAuthGuard)
@RequirePermission('ai_copilot')
export class CopilotAgentController {
  constructor(
    private readonly copilot: CopilotAgentService,
    private readonly tenant: TenantService,
  ) {}

  @Post('message')
  @ApiOperation({ summary: 'Сообщение сотрудника AI-копилоту' })
  async message(@Body() dto: CopilotMessageDto, @Req() req: AdminRequest) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.copilot.handle({
      conversationId: dto.conversationId,
      tenantId,
      employeeId: req.adminId,
      permissions: req.adminPerms,
      text: dto.text,
    });
  }

  @Post('confirm')
  @ApiOperation({ summary: 'Подтвердить/отклонить предложенные копилотом действия' })
  async confirm(@Body() dto: CopilotConfirmDto, @Req() req: AdminRequest) {
    const tenantId = await this.tenant.getDefaultTenantId();
    return this.copilot.confirm({
      conversationId: dto.conversationId,
      tenantId,
      employeeId: req.adminId,
      permissions: req.adminPerms,
      decisions: dto.decisions,
    });
  }
}
