import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CleaningRuleCondition, MaintenanceSeverity, OpsAutomationType, OpsBlockerKind, OpsNotifyTarget, OpsRecurFreq, OpsTaskKind, OpsTaskStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsISO8601, IsObject, IsOptional, IsString, Min } from 'class-validator';

export class CreateOpsTaskDto {
  @ApiProperty() @IsString() title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ enum: OpsTaskKind }) @IsOptional() @IsEnum(OpsTaskKind) kind?: OpsTaskKind;
  @ApiPropertyOptional() @IsOptional() @IsString() propertyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() roomId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() zoneId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cleaningTypeId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) assigneeIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) watcherIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) tagIds?: string[];
  @ApiPropertyOptional({ type: [String], description: 'Чек-листы (снапшот прикрепляется при создании)' })
  @IsOptional() @IsArray() @IsString({ each: true }) checklistIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() important?: boolean;
  @ApiPropertyOptional({ enum: MaintenanceSeverity }) @IsOptional() @IsEnum(MaintenanceSeverity) severity?: MaintenanceSeverity;
  @ApiPropertyOptional({ description: 'Снять номер с продажи (OUT_OF_ORDER) до завершения' }) @IsOptional() @IsBoolean() blocksSale?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() dueAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() acceptBy?: string;
  @ApiPropertyOptional({ description: 'Запланировать: создать в статусе PLAN до этого момента' }) @IsOptional() @IsISO8601() scheduledAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() planDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supervisorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requirePhotoResult?: boolean;
  @ApiPropertyOptional({ description: 'Требовать подтверждение установщика перед завершением' }) @IsOptional() @IsBoolean() requireConfirmation?: boolean;
  @ApiPropertyOptional({ description: 'Создать из шаблона (id)' }) @IsOptional() @IsString() templateId?: string;
  @ApiPropertyOptional({ description: 'Назначить на отдел (UserGroup.id); XOR assigneeIds' }) @IsOptional() @IsString() groupId?: string;
  @ApiPropertyOptional({ description: 'Заявка от гостя (LQA): жёстче SLA, callback перед закрытием' }) @IsOptional() @IsBoolean() guestRequest?: boolean;
  // Возвратный шаг (workflow-ТЗ §6): что вернуть автору после закрытия задачи.
  @ApiPropertyOptional({ description: 'После закрытия создать задачу с этим текстом (возвратный шаг)' }) @IsOptional() @IsString() followUpText?: string;
  @ApiPropertyOptional({ description: 'Кому вернуть возвратный шаг (по умолчанию — автор)' }) @IsOptional() @IsString() followUpAssigneeId?: string;
  @ApiPropertyOptional({ description: 'Задача-источник (для внутреннего создания возвратного шага)' }) @IsOptional() @IsString() parentTaskId?: string;
}

export class UpdateOpsTaskDto {
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) assigneeIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) watcherIds?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) tagIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() important?: boolean;
  @ApiPropertyOptional({ enum: MaintenanceSeverity }) @IsOptional() @IsEnum(MaintenanceSeverity) severity?: MaintenanceSeverity;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() dueAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsISO8601() acceptBy?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supervisorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cleaningTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requirePhotoResult?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requireConfirmation?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() groupId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() guestRequest?: boolean;
}

export class ChangeStatusDto {
  @ApiProperty({ enum: OpsTaskStatus }) @IsEnum(OpsTaskStatus) to!: OpsTaskStatus;
  @ApiPropertyOptional({ description: 'Комментарий (обязателен при отмене)' }) @IsOptional() @IsString() note?: string;
  // Блокер при переводе в «Отложена» (PAUSED, workflow-ТЗ §2.1).
  @ApiPropertyOptional({ enum: OpsBlockerKind, description: 'Причина, почему откладываем (PAUSED)' }) @IsOptional() @IsEnum(OpsBlockerKind) blockerKind?: OpsBlockerKind;
  @ApiPropertyOptional({ description: 'Заметка к блокеру' }) @IsOptional() @IsString() blockerNote?: string;
  @ApiPropertyOptional({ description: 'Ожидаемая дата решения / авто-возврата (для SCHEDULED или если у задачи нет срока)' }) @IsOptional() @IsISO8601() blockerUntil?: string;
}

/** Делегирование задачи (§4.4): передать другому исполнителю/отделу. */
export class DelegateDto {
  @ApiPropertyOptional({ description: 'Новый исполнитель (AdminUser.id)' }) @IsOptional() @IsString() toUserId?: string;
  @ApiPropertyOptional({ description: 'Новый отдел (UserGroup.id)' }) @IsOptional() @IsString() toGroupId?: string;
  @ApiPropertyOptional({ description: 'Комментарий/причина делегирования' }) @IsOptional() @IsString() note?: string;
}

export class CommentDto {
  @ApiProperty() @IsString() body!: string;
}

export class AnswerChecklistDto {
  @ApiPropertyOptional({ description: 'YES | NO | THIRD; пусто — сохранить только комментарий' }) @IsOptional() @IsString() answer?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class ChecklistItemInput {
  @ApiProperty() @IsString() kind!: string;
  @ApiProperty() @IsString() text!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() thirdOption?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() requirePhoto?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() excludeFromScore?: boolean;
}

export class SaveChecklistDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ type: [ChecklistItemInput] }) @IsArray() @Type(() => ChecklistItemInput) items!: (ChecklistItemInput & { parentIndex?: number | null })[];
}

export class SaveTagDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class SaveTemplateDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ description: 'Поля задачи (CreateOpsTaskDto без scheduledAt)' }) @IsObject() payload!: Record<string, unknown>;
}

export class SaveRecurringDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ description: 'Полные поля задачи (CreateOpsTaskDto): правило = «обычная задача» + расписание' }) @IsObject() payload!: Record<string, unknown>;
  @ApiProperty({ enum: OpsRecurFreq }) @IsEnum(OpsRecurFreq) freq!: OpsRecurFreq;
  @ApiProperty({ description: 'HH:mm — время создания задачи' }) @IsString() time!: string;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @IsInt({ each: true }) days?: number[];
  @ApiPropertyOptional({ description: 'INTERVAL: каждые N дней' }) @IsOptional() @IsInt() @Min(1) intervalDays?: number;
  @ApiPropertyOptional({ description: 'Начало действия (первое срабатывание не раньше)' }) @IsOptional() @IsISO8601() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}

/** SLA-политика (LQA): нормативы по критичности и источнику заявки. */
export class SaveSlaPolicyDto {
  @ApiProperty({ enum: MaintenanceSeverity }) @IsEnum(MaintenanceSeverity) severity!: MaintenanceSeverity;
  @ApiProperty({ description: 'true — заявка от гостя' }) @IsBoolean() guestRequest!: boolean;
  @ApiPropertyOptional({ description: 'Норматив принятия, мин' }) @IsOptional() @IsInt() @Min(1) acceptMinutes?: number | null;
  @ApiPropertyOptional({ description: 'Норматив выполнения, мин' }) @IsOptional() @IsInt() @Min(1) dueMinutes?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}

/** ППР-цикл (LQA preventive maintenance): профилактический обход номерного фонда. */
export class SavePmRuleDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() propertyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() roomTypeId?: string;
  @ApiProperty({ description: 'Период цикла, дней (90 = квартал)' }) @IsInt() @Min(1) periodDays!: number;
  @ApiPropertyOptional({ description: 'Задач в день (порция обхода)' }) @IsOptional() @IsInt() @Min(1) perDay?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() checklistId?: string;
  @ApiPropertyOptional({ description: 'Отдел-исполнитель (инженерная служба)' }) @IsOptional() @IsString() groupId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) tagIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}

export class SaveAutomationDto {
  @ApiProperty({ enum: OpsAutomationType }) @IsEnum(OpsAutomationType) type!: OpsAutomationType;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ enum: OpsTaskStatus }) @IsEnum(OpsTaskStatus) status!: OpsTaskStatus;
  @ApiProperty() @IsInt() @Min(1) afterMinutes!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) repeatMinutes?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() targetRoleKey?: string;
  @ApiPropertyOptional({ enum: MaintenanceSeverity, description: 'Условие: только эта критичность' }) @IsOptional() @IsEnum(MaintenanceSeverity) severity?: MaintenanceSeverity;
  @ApiPropertyOptional({ description: 'Условие: только задачи с этим тегом' }) @IsOptional() @IsString() tagId?: string;
  @ApiPropertyOptional({ description: 'Условие: только гостевые заявки' }) @IsOptional() @IsBoolean() guestOnly?: boolean;
  @ApiPropertyOptional({ enum: OpsNotifyTarget, description: 'Кого уведомлять (ESCALATE): USER/GROUP_HEAD/SUPERVISOR/CREATOR' })
  @IsOptional() @IsEnum(OpsNotifyTarget) notifyTarget?: OpsNotifyTarget;
  @ApiPropertyOptional() @IsOptional() @IsString() escalateToUserId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}

export class SaveCleaningTypeDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() forResidential?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() checklistId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() checklistBeforeStart?: boolean;
}

export class SaveCleaningStandardDto {
  @ApiProperty() @IsString() cleaningTypeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() roomTypeId?: string;
  @ApiProperty() @IsInt() @Min(1) minutes!: number;
}

export class SaveCleaningRuleDto {
  @ApiProperty() @IsString() cleaningTypeId!: string;
  @ApiProperty({ enum: CleaningRuleCondition }) @IsEnum(CleaningRuleCondition) condition!: CleaningRuleCondition;
  @ApiPropertyOptional() @IsOptional() @IsString() propertyId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() roomTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) minStayNights?: number;
  @ApiPropertyOptional({ description: 'Только брони этого тарифа (§6.2 v2)' }) @IsOptional() @IsString() ratePlanId?: string;
  @ApiPropertyOptional({ description: 'Только брони с промокодом' }) @IsOptional() @IsString() promoCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() enabled?: boolean;
}

export class SaveZoneDto {
  @ApiProperty() @IsString() propertyId!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() floor?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sectionId?: string;
}

export class SaveSectionDto {
  @ApiProperty() @IsString() propertyId!: string;
  @ApiProperty() @IsString() name!: string;
}

export class PlanAssignDto {
  @ApiProperty() @IsString() taskId!: string;
  @ApiPropertyOptional({ description: 'null — вернуть в нераспределённые' }) @IsOptional() @IsString() userId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() planOrder?: number;
}

export class PlanAutoDto {
  @ApiProperty() @IsISO8601() date!: string;
  @ApiProperty() @IsString() propertyId!: string;
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) userIds!: string[];
}

export class PlanSendDto {
  @ApiProperty() @IsISO8601() date!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() propertyId?: string;
  @ApiPropertyOptional({ description: 'Отправить только этому исполнителю' }) @IsOptional() @IsString() userId?: string;
}

export class DndDto {
  @ApiPropertyOptional({ description: 'До какого времени; null — снять DND' }) @IsOptional() @IsISO8601() until?: string;
}

export class DutyDto {
  @ApiProperty() @IsBoolean() on!: boolean;
}

export class WriteoffDto {
  @ApiPropertyOptional() @IsOptional() @IsString() listId?: string;
  @ApiProperty({ description: '[{itemId, qty}]' }) @IsArray() items!: { itemId: string; qty: number }[];
}

export class SaveWriteoffListDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() cleaningTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() roomTypeId?: string;
  @ApiProperty({ description: '[{itemId, qty}]' }) @IsArray() items!: { itemId: string; qty: number }[];
}
