import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentGuestId } from '../auth/current-guest.decorator.js';
import { CheckinService } from './checkin.service.js';
import { SaveCheckinDto } from './dto/save-checkin.dto.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 МБ

@ApiTags('checkin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('bookings/:bookingId/checkin')
export class CheckinController {
  constructor(private readonly checkin: CheckinService) {}

  @Get()
  @ApiOperation({ summary: 'Регистрация по брони (создаёт черновик)' })
  get(@CurrentGuestId() guestId: string, @Param('bookingId') bookingId: string) {
    return this.checkin.getOrStart(guestId, bookingId);
  }

  @Put()
  @ApiOperation({ summary: 'Сохранить анкету регистрации' })
  save(
    @CurrentGuestId() guestId: string,
    @Param('bookingId') bookingId: string,
    @Body() dto: SaveCheckinDto,
  ) {
    return this.checkin.saveDraft(guestId, bookingId, dto);
  }

  @Post('passport')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Загрузить скан паспорта (шифруется)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  uploadPassport(
    @CurrentGuestId() guestId: string,
    @Param('bookingId') bookingId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.checkin.uploadPassport(guestId, bookingId, file);
  }

  @Post('passport/recognize')
  @ApiOperation({ summary: 'Распознать паспорт со скана (OCR) для автозаполнения' })
  recognizePassport(@CurrentGuestId() guestId: string, @Param('bookingId') bookingId: string) {
    return this.checkin.recognizePassport(guestId, bookingId);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Отправить регистрацию на проверку' })
  submit(@CurrentGuestId() guestId: string, @Param('bookingId') bookingId: string) {
    return this.checkin.submit(guestId, bookingId);
  }
}
