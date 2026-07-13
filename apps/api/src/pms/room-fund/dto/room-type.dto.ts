import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Категория номеров (RoomType) — «карточка» номерного фонда (Путь B).
 * Обязателен только объект + название; остальное — прогрессивно (Фаза 2 — полный редактор).
 * Адрес/координаты/«как добраться» — на категории (решение владельца).
 */
export class CreateRoomTypeDto {
  @ApiProperty() @IsString() propertyId!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional({ description: 'Сокращённое название' }) @IsOptional() @IsString() shortName?: string;
  @ApiPropertyOptional({ description: 'Тип (ROOM_TYPE_OPTIONS): Апартаменты/Студия/Номер…' }) @IsOptional() @IsString() typeLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bedType?: string;
  @ApiPropertyOptional({ type: [String], description: 'Предпочтение кроватей (мультивыбор)' }) @IsOptional() @IsArray() @IsString({ each: true }) bedPreferences?: string[];
  @ApiPropertyOptional({ description: 'SAME | RANGE' }) @IsOptional() @IsIn(['SAME', 'RANGE']) areaMode?: string;
  @ApiPropertyOptional({ description: 'Площадь (или «от» при RANGE), м²' }) @IsOptional() @Type(() => Number) @IsNumber() areaSqm?: number;
  @ApiPropertyOptional({ description: 'Площадь «до» при RANGE, м²' }) @IsOptional() @Type(() => Number) @IsNumber() areaSqmTo?: number;
  @ApiPropertyOptional({ description: 'Комнат в юните' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) roomsInUnit?: number;
  @ApiPropertyOptional({ description: 'Основных мест (1–15)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(15) mainPlaces?: number;
  @ApiPropertyOptional({ description: 'Дополнительных мест (0–8)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(8) extraPlaces?: number;
  @ApiPropertyOptional({ description: 'Залог по умолчанию, ₽' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) securityDeposit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String], description: 'Коды оснащения (amenities)' }) @IsOptional() @IsArray() @IsString({ each: true }) amenities?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Вид из окна (мультивыбор, легаси)' }) @IsOptional() @IsArray() @IsString({ each: true }) views?: string[];
  @ApiPropertyOptional({ description: 'Предпочтение: кровати (одиночный)' }) @IsOptional() @IsString() bedPreference?: string;
  @ApiPropertyOptional({ description: 'Предпочтение: вид из окна (одиночный)' }) @IsOptional() @IsString() viewPreference?: string;
  @ApiPropertyOptional({ type: [String], description: 'До 5 приоритетных элементов оснащения (по порядку)' }) @IsOptional() @IsArray() @IsString({ each: true }) priorityAmenities?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Фотогалерея (URL); первое фото — обложка' }) @IsOptional() @IsArray() @IsString({ each: true }) photos?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Видео (URL загруженных MP4/WebM/MOV)' }) @IsOptional() @IsArray() @IsString({ each: true }) videos?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
  @ApiPropertyOptional({ description: 'Как до нас добраться' }) @IsOptional() @IsString() howToReach?: string;
  @ApiPropertyOptional({ description: 'PDF к подтверждению брони (URL)' }) @IsOptional() @IsString() confirmationFileUrl?: string;
  @ApiPropertyOptional({ description: 'Показывать в модуле «Бронирования»' }) @IsOptional() @IsBoolean() showInBooking?: boolean;
  @ApiPropertyOptional({ description: 'Выгружать на OTA' }) @IsOptional() @IsBoolean() showInOta?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

/** Обновление категории (все поля опциональны; объект не меняем). */
export class UpdateRoomTypeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() shortName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() typeLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bedType?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) bedPreferences?: string[];
  @ApiPropertyOptional() @IsOptional() @IsIn(['SAME', 'RANGE']) areaMode?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() areaSqm?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() areaSqmTo?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) roomsInUnit?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(15) mainPlaces?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(8) extraPlaces?: number;
  @ApiPropertyOptional({ description: 'Залог по умолчанию, ₽' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) securityDeposit?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) amenities?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) views?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() bedPreference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() viewPreference?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) priorityAmenities?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) photos?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) videos?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() howToReach?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() confirmationFileUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showInBooking?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showInOta?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

/** Переупорядочивание категорий (drag): порядок id в рамках объекта. */
export class ReorderRoomTypesDto {
  @ApiProperty() @IsString() propertyId!: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) orderedIds!: string[];
}

/** Быстрое переключение тумблеров видимости. */
export class RoomTypeVisibilityDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showInBooking?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() showInOta?: boolean;
}
