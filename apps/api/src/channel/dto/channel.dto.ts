import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChannelKind, ChannelStatus, SyncJobType } from '@prisma/client';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

export type MappingKind = 'property' | 'room-type' | 'rate-plan';

export class CreateChannelDto {
  @ApiProperty({ example: 'ostrovok', description: 'Код канала (уникален в арендаторе)' }) @IsString() code!: string;
  @ApiProperty({ example: 'Ostrovok' }) @IsString() name!: string;
  @ApiPropertyOptional({ enum: ChannelKind }) @IsOptional() @IsEnum(ChannelKind) kind?: ChannelKind;
  @ApiPropertyOptional({ description: 'Настройки/учётные данные (mock): { token, mode }' }) @IsOptional() @IsObject() credentials?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateChannelDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ enum: ChannelStatus }) @IsOptional() @IsEnum(ChannelStatus) status?: ChannelStatus;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsObject() credentials?: Record<string, unknown>;
}

/** Установка маппинга: наш id ↔ id в канале. */
export class SetMappingDto {
  @ApiProperty({ description: 'Наш id (propertyId / roomTypeId / ratePlanId)' }) @IsString() localId!: string;
  @ApiProperty({ description: 'Id сущности в канале' }) @IsString() remoteId!: string;
}

export class EnqueueSyncDto {
  @ApiProperty() @IsString() propertyId!: string;
  @ApiPropertyOptional({ enum: SyncJobType, description: 'По умолчанию AVAILABILITY' }) @IsOptional() @IsEnum(SyncJobType) jobType?: SyncJobType;
}
