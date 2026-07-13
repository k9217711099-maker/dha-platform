import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WhAddressType, WhDocType, WhNormUnit, WhRequestPriority, WhWarehouseType, WhWriteOffReason } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

// ─── Адреса ───────────────────────────────────────────────────────────────────
export class CreateAddressDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fullAddress?: string;
  @ApiPropertyOptional({ enum: WhAddressType }) @IsOptional() @IsEnum(WhAddressType) type?: WhAddressType;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) roomsCount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() responsible?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class UpdateAddressDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fullAddress?: string;
  @ApiPropertyOptional({ enum: WhAddressType }) @IsOptional() @IsEnum(WhAddressType) type?: WhAddressType;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) roomsCount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() responsible?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Склады ───────────────────────────────────────────────────────────────────
export class CreateWarehouseDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional({ enum: WhWarehouseType }) @IsOptional() @IsEnum(WhWarehouseType) type?: WhWarehouseType;
  @ApiPropertyOptional() @IsOptional() @IsString() addressId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() responsible?: string;
}

export class UpdateWarehouseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ enum: WhWarehouseType }) @IsOptional() @IsEnum(WhWarehouseType) type?: WhWarehouseType;
  @ApiPropertyOptional() @IsOptional() @IsString() addressId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() responsible?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Категории ────────────────────────────────────────────────────────────────
export class CreateCategoryDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() sortOrder?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Номенклатура ─────────────────────────────────────────────────────────────
export class CreateItemDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sku?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() barcode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subcategory?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() photoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackBatches?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackExpiry?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackSerial?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minStock?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxStock?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) parStock?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lastPurchasePrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) vatRate?: number;
}

export class UpdateItemDto extends CreateItemDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Поставщики ───────────────────────────────────────────────────────────────
export class CreateSupplierDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() inn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() kpp?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentTerms?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class UpdateSupplierDto extends CreateSupplierDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() active?: boolean;
}

// ─── Документы ────────────────────────────────────────────────────────────────
export class DocumentLineDto {
  @ApiProperty() @IsString() itemId!: string;
  @ApiProperty({ description: 'Количество (>0, допускаются дробные)' })
  @Type(() => Number) @IsNumber() @Min(0.0001) quantity!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) price?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() batch?: string;
  @ApiPropertyOptional({ description: 'Срок годности (ISO yyyy-mm-dd)' })
  @IsOptional() @IsString() expiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class CreateDocumentDto {
  @ApiProperty({ enum: WhDocType }) @IsEnum(WhDocType) type!: WhDocType;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierId?: string;
  @ApiPropertyOptional({ description: 'Склад-получатель (приход/возврат)' })
  @IsOptional() @IsString() toWarehouseId?: string;
  @ApiPropertyOptional({ description: 'Склад-отправитель (перемещение/выдача/списание)' })
  @IsOptional() @IsString() fromWarehouseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() addressId?: string;
  @ApiPropertyOptional({ description: 'Номер накладной/счёта/УПД поставщика' })
  @IsOptional() @IsString() externalRef?: string;
  @ApiPropertyOptional({ enum: WhWriteOffReason, description: 'Причина (для списания, §5.4)' })
  @IsOptional() @IsEnum(WhWriteOffReason) reason?: WhWriteOffReason;
  @ApiPropertyOptional() @IsOptional() @IsString() docDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiProperty({ type: [DocumentLineDto] })
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => DocumentLineDto)
  lines!: DocumentLineDto[];
}

// ─── Заявки на пополнение ─────────────────────────────────────────────────────
export class RequestLineDto {
  @ApiProperty() @IsString() itemId!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.0001) quantity!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class CreateRequestDto {
  @ApiProperty() @IsString() addressId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subdivision?: string;
  @ApiPropertyOptional({ enum: WhRequestPriority }) @IsOptional() @IsEnum(WhRequestPriority) priority?: WhRequestPriority;
  @ApiPropertyOptional({ description: 'Желаемая дата доставки (ISO)' }) @IsOptional() @IsString() desiredDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiProperty({ type: [RequestLineDto] })
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => RequestLineDto)
  lines!: RequestLineDto[];
}

export class RejectRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

// ─── Подтверждение получения перемещения (§5.3) ───────────────────────────────
export class ReceiveLineDto {
  @ApiProperty() @IsString() lineId!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) receivedQty!: number;
}

export class ReceiveDto {
  @ApiPropertyOptional({ type: [ReceiveLineDto], description: 'Фактически полученное по строкам; пусто — принять всё отгруженное' })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiveLineDto)
  lines?: ReceiveLineDto[];
}

// ─── Инвентаризация (§5.6) ────────────────────────────────────────────────────
export class StartInventoryDto {
  @ApiProperty() @IsString() warehouseId!: string;
  @ApiPropertyOptional({ description: 'Ограничить категорией' }) @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class InventoryFactLineDto {
  @ApiProperty() @IsString() lineId!: string;
  @ApiProperty({ description: 'Фактический остаток' }) @Type(() => Number) @IsNumber() @Min(0) factQuantity!: number;
  @ApiPropertyOptional({ description: 'Причина отклонения (обязательна при недостаче)' }) @IsOptional() @IsString() reason?: string;
}

export class UpdateInventoryFactsDto {
  @ApiProperty({ type: [InventoryFactLineDto] })
  @IsArray() @ArrayNotEmpty() @ValidateNested({ each: true }) @Type(() => InventoryFactLineDto)
  lines!: InventoryFactLineDto[];
}

// ─── Нормы расхода (§7) ───────────────────────────────────────────────────────
export class CreateNormDto {
  @ApiProperty() @IsString() itemId!: string;
  @ApiPropertyOptional({ description: 'Адрес (пусто — норма для всех адресов)' }) @IsOptional() @IsString() addressId?: string;
  @ApiPropertyOptional({ description: 'Категория номера' }) @IsOptional() @IsString() roomCategory?: string;
  @ApiProperty({ enum: WhNormUnit }) @IsEnum(WhNormUnit) unit!: WhNormUnit;
  @ApiProperty({ description: 'Нормативное количество на единицу базы' }) @Type(() => Number) @IsNumber() @Min(0) normQuantity!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() validFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() validUntil?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class UpdateNormDto {
  @ApiPropertyOptional({ enum: WhNormUnit }) @IsOptional() @IsEnum(WhNormUnit) unit?: WhNormUnit;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) normQuantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() roomCategory?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() validFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() validUntil?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}
