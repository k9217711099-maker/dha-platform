import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HousekeepingStatus, MaintenanceStatus, RoomSellStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';

/** Конкретный номер/юнит: привязан к объекту и категории. */
export class CreateRoomDto {
  @ApiProperty() @IsString() propertyId!: string;
  @ApiProperty() @IsString() roomTypeId!: string;
  @ApiProperty() @IsString() number!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() floor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional({ description: 'Не учитывать в статистике (RevPAR/загрузка)' }) @IsOptional() @IsBoolean() excludeFromStats?: boolean;
  @ApiPropertyOptional({ enum: RoomSellStatus }) @IsOptional() @IsEnum(RoomSellStatus) sellStatus?: RoomSellStatus;
  @ApiPropertyOptional({ enum: HousekeepingStatus }) @IsOptional() @IsEnum(HousekeepingStatus) housekeepingStatus?: HousekeepingStatus;
  @ApiPropertyOptional({ enum: MaintenanceStatus }) @IsOptional() @IsEnum(MaintenanceStatus) maintenanceStatus?: MaintenanceStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() lockId?: string;
}

export class UpdateRoomDto {
  @ApiPropertyOptional() @IsOptional() @IsString() number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() floor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() roomTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() excludeFromStats?: boolean;
  @ApiPropertyOptional({ enum: RoomSellStatus }) @IsOptional() @IsEnum(RoomSellStatus) sellStatus?: RoomSellStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() lockId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  /** Секция для распределения уборок (TASKS-HOUSEKEEPING-TZ §7); пустая строка — отвязать. */
  @ApiPropertyOptional() @IsOptional() @IsString() sectionId?: string;
  /** Инструкция по заселению юнита (режим апартаментов, CHECK-IN-TZ). */
  @ApiPropertyOptional() @IsOptional() @IsString() checkinInstructions?: string;
  /** Фото-инструкция по заселению (публичные URL), режим апартаментов. */
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) checkinPhotos?: string[];
}

/** Массовое добавление номеров по числовому диапазону (напр. 101…105 → 5 номеров). */
export class BulkCreateRoomsDto {
  @ApiProperty() @IsString() propertyId!: string;
  @ApiProperty() @IsString() roomTypeId!: string;
  @ApiProperty({ example: '101', description: 'Начало диапазона' }) @IsString() from!: string;
  @ApiProperty({ example: '105', description: 'Конец диапазона' }) @IsString() to!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() floor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() excludeFromStats?: boolean;
}

/** Один элемент множественного добавления (номера, идущие не подряд). */
export class BatchRoomItemDto {
  @ApiProperty() @IsString() number!: string;
  @ApiProperty() @IsString() roomTypeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() floor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() excludeFromStats?: boolean;
}

/** Множественное добавление разных номеров в одном окне. */
export class BatchCreateRoomsDto {
  @ApiProperty() @IsString() propertyId!: string;
  @ApiProperty({ type: [BatchRoomItemDto] }) @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => BatchRoomItemDto) rooms!: BatchRoomItemDto[];
}

/** Один элемент массового заполнения инструкций/адресов (режим апартаментов). */
export class BulkInstructionItemDto {
  @ApiProperty() @IsString() roomId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() checkinInstructions?: string;
}

/** Массовое заполнение инструкций по заселению и адресов номеров (CHECK-IN-TZ, апартаменты). */
export class BulkInstructionsDto {
  @ApiProperty({ type: [BulkInstructionItemDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => BulkInstructionItemDto)
  items!: BulkInstructionItemDto[];
}

/** Смена операционного статуса номера (housekeeping / maintenance / продаваемость). */
export class RoomStatusDto {
  @ApiPropertyOptional({ enum: HousekeepingStatus }) @IsOptional() @IsEnum(HousekeepingStatus) housekeepingStatus?: HousekeepingStatus;
  @ApiPropertyOptional({ enum: MaintenanceStatus }) @IsOptional() @IsEnum(MaintenanceStatus) maintenanceStatus?: MaintenanceStatus;
  @ApiPropertyOptional({ enum: RoomSellStatus }) @IsOptional() @IsEnum(RoomSellStatus) sellStatus?: RoomSellStatus;
}
