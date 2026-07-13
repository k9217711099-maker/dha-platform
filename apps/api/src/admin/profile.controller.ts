import { Body, Controller, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { CurrentAdminId } from './current-admin.decorator.js';
import { RolesService } from './roles.service.js';
import { UploadsService } from '../pms/uploads/uploads.service.js';
import { UpdateMyProfileDto } from './dto/roles.dto.js';

/** Моя карточка (§6, self-service): любой сотрудник редактирует СВОИ самозаполняемые поля. Без права `roles`. */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('admin/profile')
export class ProfileController {
  constructor(
    private readonly roles: RolesService,
    private readonly uploads: UploadsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Моя карточка сотрудника' })
  me(@CurrentAdminId() adminId: string) {
    return this.roles.myProfile(adminId);
  }

  @Get('user/:id')
  @ApiOperation({ summary: 'Публичный профиль коллеги (карточка из мессенджера)' })
  publicProfile(@Param('id') id: string) {
    return this.roles.publicProfile(id);
  }

  @Patch()
  @ApiOperation({ summary: 'Обновить свои поля (телефон/ДР/хобби/о себе/пользовательские SELF|BOTH)' })
  update(@Body() dto: UpdateMyProfileDto, @CurrentAdminId() adminId: string) {
    return this.roles.updateMyProfile(adminId, dto);
  }

  @Post('photo')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Загрузить своё фото' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async photo(@UploadedFile() file: Express.Multer.File, @CurrentAdminId() adminId: string) {
    const saved = await this.uploads.saveImage(file);
    return this.roles.setPhoto(adminId, saved.url);
  }
}
