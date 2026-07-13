import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from './admin-auth.guard.js';
import { RequirePermission } from './require-permission.decorator.js';
import { CurrentAdminId } from './current-admin.decorator.js';
import { RolesService } from './roles.service.js';
import { UploadsService } from '../pms/uploads/uploads.service.js';
import { CreateAdminUserDto, SaveFieldDefDto, SavePositionDto, UpdateAdminUserDto, UpdateRoleDto } from './dto/roles.dto.js';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@RequirePermission('roles')
@Controller('admin')
export class RolesController {
  constructor(
    private readonly roles: RolesService,
    private readonly uploads: UploadsService,
  ) {}

  @Get('permissions')
  @ApiOperation({ summary: 'Каталог прав доступа' })
  permissions() {
    return this.roles.permissionsCatalog();
  }

  @Get('roles')
  @ApiOperation({ summary: 'Роли доступа' })
  list() {
    return this.roles.list();
  }

  @Post('roles')
  @ApiOperation({ summary: 'Создать кастомную роль (конструктор ролей)' })
  createRole(@Body() dto: { name: string; permissions?: string[] }) {
    return this.roles.createRole(dto);
  }

  @Patch('roles/:key')
  @ApiOperation({ summary: 'Изменить права роли' })
  update(@Param('key') key: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(key, dto);
  }

  @Delete('roles/:key')
  @ApiOperation({ summary: 'Удалить кастомную роль' })
  deleteRole(@Param('key') key: string) {
    return this.roles.deleteRole(key);
  }

  @Get('users')
  @ApiOperation({ summary: 'Сотрудники админ-панели' })
  users() {
    return this.roles.listUsers();
  }

  @Post('users')
  @ApiOperation({ summary: 'Создать сотрудника' })
  createUser(@Body() dto: CreateAdminUserDto) {
    return this.roles.createUser(dto);
  }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Изменить сотрудника (роль/должность/отделы/объекты/карточка)' })
  updateUser(@Param('id') id: string, @Body() dto: UpdateAdminUserDto, @CurrentAdminId() actorId?: string) {
    return this.roles.updateUser(id, dto, actorId);
  }

  @Get('users/:id/card')
  @ApiOperation({ summary: 'Карточка сотрудника (§6)' })
  card(@Param('id') id: string) {
    return this.roles.getUserCard(id);
  }

  @Post('users/:id/photo')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Загрузить фото сотрудника' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async photo(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    const saved = await this.uploads.saveImage(file);
    return this.roles.setPhoto(id, saved.url);
  }

  // ── Пользовательские поля карточки (§6) ──
  @Get('employee-fields')
  @ApiOperation({ summary: 'Определения пользовательских полей' })
  fieldDefs() {
    return this.roles.listFieldDefs();
  }
  @Post('employee-fields')
  createFieldDef(@Body() dto: SaveFieldDefDto) {
    return this.roles.createFieldDef(dto);
  }
  @Patch('employee-fields/:id')
  updateFieldDef(@Param('id') id: string, @Body() dto: SaveFieldDefDto) {
    return this.roles.updateFieldDef(id, dto);
  }
  @Delete('employee-fields/:id')
  deleteFieldDef(@Param('id') id: string) {
    return this.roles.deleteFieldDef(id);
  }

  @Get('positions')
  @ApiOperation({ summary: 'Должности (оргструктура)' })
  positions() {
    return this.roles.listPositions();
  }

  @Post('positions')
  @ApiOperation({ summary: 'Создать должность' })
  createPosition(@Body() dto: SavePositionDto) {
    return this.roles.createPosition(dto);
  }

  @Patch('positions/:id')
  @ApiOperation({ summary: 'Изменить должность' })
  updatePosition(@Param('id') id: string, @Body() dto: SavePositionDto) {
    return this.roles.updatePosition(id, dto);
  }

  @Delete('positions/:id')
  @ApiOperation({ summary: 'Удалить должность' })
  deletePosition(@Param('id') id: string) {
    return this.roles.deletePosition(id);
  }
}
