import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CurrentGuestId } from '../auth/current-guest.decorator.js';
import { FavoritesService } from './favorites.service.js';

class AddFavoriteDto {
  @IsString()
  roomTypeId!: string;
}

@ApiTags('favorites')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('favorites')
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @ApiOperation({ summary: 'Избранные категории гостя' })
  list(@CurrentGuestId() guestId: string) {
    return this.favorites.list(guestId);
  }

  @Get('ids')
  @ApiOperation({ summary: 'ID избранных категорий (для подсветки)' })
  ids(@CurrentGuestId() guestId: string) {
    return this.favorites.ids(guestId);
  }

  @Post()
  @ApiOperation({ summary: 'Добавить категорию в избранное' })
  add(@CurrentGuestId() guestId: string, @Body() dto: AddFavoriteDto) {
    return this.favorites.add(guestId, dto.roomTypeId);
  }

  @Delete(':roomTypeId')
  @ApiOperation({ summary: 'Убрать категорию из избранного' })
  remove(@CurrentGuestId() guestId: string, @Param('roomTypeId') roomTypeId: string) {
    return this.favorites.remove(guestId, roomTypeId);
  }
}
