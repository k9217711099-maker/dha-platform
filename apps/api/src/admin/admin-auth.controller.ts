import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { CurrentAdminId } from './current-admin.decorator.js';
import { AdminLoginDto } from './dto/admin.dto.js';

@ApiTags('admin')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly auth: AdminAuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Вход администратора' })
  login(@Body() dto: AdminLoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  @ApiOperation({ summary: 'Текущий сотрудник и его права' })
  me(@CurrentAdminId() adminId: string) {
    return this.auth.me(adminId);
  }
}
