import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { FUNNEL_CHANNELS, FUNNEL_CONDITIONS, FUNNEL_STAGE_KEYS } from '@dha/domain';

const STAGE_KEYS = FUNNEL_STAGE_KEYS.map((s) => s.key);
const CHANNEL_KEYS = FUNNEL_CHANNELS.map((c) => c.key);
const CONDITION_TYPES = FUNNEL_CONDITIONS.map((c) => c.type);

/** Условие-шлюз этапа: только из словаря FUNNEL_CONDITIONS (§2.1). */
export class FunnelConditionDto {
  @IsIn(CONDITION_TYPES)
  type!: string;

  @ApiPropertyOptional({ description: 'Параметры условия (напр. { require: "deposit_or_full" })' })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}

export class UpsertFunnelDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ description: 'Markdown «как устроено заселение»' })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ description: 'Объект для переопределения (scope=PROPERTY)' })
  @IsOptional()
  @IsString()
  propertyId?: string;
}

export class UpsertStageDto {
  @ApiPropertyOptional({ enum: STAGE_KEYS })
  @IsOptional()
  @IsIn(STAGE_KEYS)
  key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FunnelConditionDto)
  conditions?: FunnelConditionDto[];

  @ApiPropertyOptional({ enum: CHANNEL_KEYS, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(CHANNEL_KEYS, { each: true })
  channels?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  notificationTemplateKey?: string;

  @ApiPropertyOptional({ description: '[{ offsetHours, channels? }] относительно заезда' })
  @IsOptional()
  @IsArray()
  reminderPolicy?: unknown[];

  @ApiPropertyOptional({ description: 'напр. { preCheckinMinutes, postCheckoutMinutes } для key_issue' })
  @IsOptional()
  @IsObject()
  timing?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '{ enabled, groupId, offsetHours?, title? } — поставить задачу в отдел, пока этап не пройден' })
  @IsOptional()
  @IsObject()
  staffTask?: Record<string, unknown>;

  @ApiPropertyOptional({ description: '«Как это работает» для гостя (markdown)' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  guestDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  staffNote?: string;

  @ApiPropertyOptional({ description: 'Подтверждение отключения защищённого шлюза (§2.3)' })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

export class ReorderStagesDto {
  @IsArray()
  @IsString({ each: true })
  stageIds!: string[];
}

export class CreateStageDto extends UpsertStageDto {
  @IsIn(STAGE_KEYS)
  declare key: string;

  @IsString()
  @MaxLength(120)
  declare title: string;

  @ApiPropertyOptional({ description: 'Позиция (по умолчанию — в конец)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}
