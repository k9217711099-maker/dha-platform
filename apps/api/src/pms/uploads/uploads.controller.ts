import { Controller, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../../admin/admin-auth.guard.js';
import { RequirePermission } from '../../admin/require-permission.decorator.js';
import { UploadsService } from './uploads.service.js';

const LIMIT = { limits: { fileSize: 10 * 1024 * 1024 } };
const VIDEO_LIMIT = { limits: { fileSize: 100 * 1024 * 1024 } };

/** Загрузка публичных файлов на сервер («диск»): фото галереи и PDF к подтверждению. */
@ApiTags('uploads')
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller('v1/uploads')
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post('image')
  @RequirePermission('pms_roomtypes')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', LIMIT))
  image(@UploadedFile() file: Express.Multer.File) {
    return this.uploads.saveImage(file);
  }

  @Post('document')
  @RequirePermission('pms_roomtypes')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', LIMIT))
  document(@UploadedFile() file: Express.Multer.File) {
    return this.uploads.savePdf(file);
  }

  @Post('video')
  @RequirePermission('pms_roomtypes')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', VIDEO_LIMIT))
  video(@UploadedFile() file: Express.Multer.File) {
    return this.uploads.saveVideo(file);
  }
}
