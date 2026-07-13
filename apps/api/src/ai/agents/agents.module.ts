import { Module } from '@nestjs/common';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { ToolsModule } from '../tools/tools.module.js';
import { GuestAgentService } from './guest-agent.service.js';
import { GuestAgentController } from './guest-agent.controller.js';
import { CopilotAgentService } from './copilot-agent.service.js';
import { CopilotAgentController } from './copilot-agent.controller.js';

/**
 * Агенты AI: гостевой агент (публичный вход) и копилот сотрудника (админ-вход под
 * правом ai_copilot). AdminAuthGuard провайдится тут (зависит только от глобальных
 * JwtService + Reflector), чтобы @UseGuards в контроллере копилота разрешился.
 */
@Module({
  imports: [ConversationsModule, ToolsModule],
  controllers: [GuestAgentController, CopilotAgentController],
  providers: [GuestAgentService, CopilotAgentService, AdminAuthGuard],
  exports: [GuestAgentService, CopilotAgentService],
})
export class AgentsModule {}
