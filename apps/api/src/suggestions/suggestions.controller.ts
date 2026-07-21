import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard, type AdminRequest } from '../admin/admin-auth.guard.js';
import { TenantService } from '../pms/tenant/tenant.service.js';
import { SuggestionService } from './suggestion.service.js';
import { CreateSuggestionDto, SetSuggestionStatusDto } from './dto/suggestion.dto.js';

/**
 * Идеи/пожелания по доработке системы (#1). Доступно любому сотруднику (только
 * AdminAuthGuard, без спец-права) — это внутренняя доска обратной связи команды.
 */
@ApiTags('suggestions')
@ApiBearerAuth()
@Controller('v1/suggestions')
@UseGuards(AdminAuthGuard)
export class SuggestionsController {
  constructor(
    private readonly suggestions: SuggestionService,
    private readonly tenant: TenantService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Список идей/пожеланий' })
  async list() {
    return this.suggestions.list(await this.tenant.getDefaultTenantId());
  }

  @Post()
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Добавить идею (раздел, текст, скрины ≤ 10)' })
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: 15 * 1024 * 1024 } }))
  async create(
    @Body() dto: CreateSuggestionDto,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: AdminRequest,
  ) {
    return this.suggestions.create(await this.tenant.getDefaultTenantId(), req.adminId, dto, files ?? []);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Изменить статус идеи' })
  setStatus(@Param('id') id: string, @Body() dto: SetSuggestionStatusDto) {
    return this.suggestions.setStatus(id, dto.status);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Удалить свою идею' })
  remove(@Param('id') id: string, @Req() req: AdminRequest) {
    return this.suggestions.remove(id, req.adminId);
  }
}
