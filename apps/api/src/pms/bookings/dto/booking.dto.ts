import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BookingChannel } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

/**
 * Позиция доп-услуги в брони. Привязывается к конкретной брони и может иметь свои
 * параметры (количество, цена). `extraId` — ссылка на каталог Extra (тогда имя/цена
 * подставятся по умолчанию, но их можно переопределить); без него — произвольная услуга.
 */
export class BookingExtraInputDto {
  @ApiPropertyOptional({ description: 'ID услуги из каталога Extra' }) @IsOptional() @IsString() extraId?: string;
  @ApiPropertyOptional({ description: 'Название (обязательно для произвольной услуги без extraId)' }) @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ description: 'Цена за единицу, ₽ (переопределяет цену из каталога)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) unitPrice?: number;
  @ApiProperty({ example: 1 }) @Type(() => Number) @IsInt() @Min(1) qty!: number;
}

/**
 * Создание брони собственным PMS. Гость задаётся либо `guestId` (существующий),
 * либо контактами (firstName + phone/email — найдём/создадим). Цена: если указан
 * `ratePlanId` — считает Rate Engine и фиксирует в брони (DHP §17); иначе менеджер
 * задаёт `totalPrice` вручную (ручная бронь).
 */
export class CreateBookingDto {
  @ApiProperty() @IsString() propertyId!: string;
  @ApiProperty() @IsString() roomTypeId!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() roomId?: string;
  @ApiProperty({ example: '2026-08-01' }) @IsDateString() checkIn!: string;
  @ApiProperty({ example: '2026-08-05' }) @IsDateString() checkOut!: string;
  @ApiProperty({ example: 2, description: 'Всего гостей (взрослые + дети). Если переданы adults/children — берётся их сумма.' }) @Type(() => Number) @IsInt() @Min(1) guests!: number;
  @ApiPropertyOptional({ example: 2 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) adults?: number;
  @ApiPropertyOptional({ example: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) children?: number;
  @ApiPropertyOptional({ example: '14:00', description: 'Планируемое время заезда HH:mm' }) @IsOptional() @IsString() arrivalTime?: string;
  @ApiPropertyOptional({ example: '12:00', description: 'Планируемое время выезда HH:mm' }) @IsOptional() @IsString() departureTime?: string;
  @ApiPropertyOptional({ example: 24000, description: 'Стоимость проживания, ₽ (обязателен для ручной брони без ratePlanId; при ratePlanId считает Rate Engine)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) totalPrice?: number;

  @ApiPropertyOptional() @IsOptional() @IsString() guestId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() ratePlanId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ratePlanName?: string;
  @ApiPropertyOptional({ enum: BookingChannel, description: 'Источник (канал) брони' }) @IsOptional() @IsEnum(BookingChannel) source?: BookingChannel;
  @ApiPropertyOptional({ description: 'Маркетинг: способ бронирования' }) @IsOptional() @IsString() bookingMethod?: string;
  @ApiPropertyOptional({ description: 'Маркетинг: откуда узнали' }) @IsOptional() @IsString() referralSource?: string;
  @ApiPropertyOptional({ description: 'Маркетинг: обоснование скидки' }) @IsOptional() @IsString() discountReason?: string;
  @ApiPropertyOptional({ type: [String], description: 'ID доп-услуг (Extra), добавляемых к брони (qty=1). Легаси — используйте extras.' }) @IsOptional() @IsArray() @IsString({ each: true }) extraIds?: string[];
  @ApiPropertyOptional({ type: [BookingExtraInputDto], description: 'Доп-услуги брони с параметрами (количество/цена)' }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => BookingExtraInputDto) extras?: BookingExtraInputDto[];
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class UpdateBookingDto {
  @ApiPropertyOptional({ example: '2026-08-01' }) @IsOptional() @IsDateString() checkIn?: string;
  @ApiPropertyOptional({ example: '2026-08-05' }) @IsOptional() @IsDateString() checkOut?: string;
  @ApiPropertyOptional({ description: 'Перенести бронь в другой объект (вместе с roomTypeId этого объекта; номер и цена сбрасываются — цена ручная до пересчёта)' }) @IsOptional() @IsString() propertyId?: string;
  @ApiPropertyOptional({ description: 'Сменить категорию номера (пересчёт доступности; номер сбрасывается)' }) @IsOptional() @IsString() roomTypeId?: string;
  @ApiPropertyOptional({ description: 'Сменить тариф (пересчёт цены Rate Engine). Требует прав pms_rates.' }) @IsOptional() @IsString() ratePlanId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() roomId?: string;
  @ApiPropertyOptional({ example: '14:00' }) @IsOptional() @IsString() arrivalTime?: string;
  @ApiPropertyOptional({ example: '12:00' }) @IsOptional() @IsString() departureTime?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1) guests?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) totalPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
  @ApiPropertyOptional({ description: 'Маркетинг: способ бронирования' }) @IsOptional() @IsString() bookingMethod?: string;
  @ApiPropertyOptional({ description: 'Маркетинг: откуда узнали' }) @IsOptional() @IsString() referralSource?: string;
  @ApiPropertyOptional({ description: 'Маркетинг: обоснование скидки' }) @IsOptional() @IsString() discountReason?: string;
  @ApiPropertyOptional({ enum: ['PENDING', 'CONFIRMED'], description: 'Смена статуса Новое/Проверено' }) @IsOptional() @IsIn(['PENDING', 'CONFIRMED']) status?: 'PENDING' | 'CONFIRMED';
  @ApiPropertyOptional({ description: 'Запрет переселения (номер зафиксирован)' }) @IsOptional() @IsBoolean() roomLocked?: boolean;
}

export class CancelBookingDto {
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
}

export class CheckInDto {
  @ApiPropertyOptional({ description: 'Назначить конкретный номер при заезде' }) @IsOptional() @IsString() roomId?: string;
}

export class PaymentLinkDto {
  @ApiPropertyOptional({ enum: ['prepayment', 'full'], description: 'Что выставить: предоплату по гарантии или полный остаток' }) @IsOptional() @IsIn(['prepayment', 'full']) kind?: 'prepayment' | 'full';
  @ApiPropertyOptional({ description: 'Явная сумма, ₽ (переопределяет kind)' }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) amount?: number;
  @ApiPropertyOptional({ description: 'Платёжная система (yookassa/bspb/paykeeper) — выбор оператора; ссылку формирует активный эквайер' }) @IsOptional() @IsString() system?: string;
}

/** Ручная регистрация оплаты на стойке (наличные/карта/перевод) — вкладка «Счёт». */
export class ManualPaymentDto {
  @ApiProperty({ description: 'Сумма оплаты, ₽' }) @Type(() => Number) @IsInt() @Min(1) amount!: number;
  @ApiProperty({ enum: ['cash', 'card', 'transfer', 'other'], description: 'Способ оплаты' }) @IsIn(['cash', 'card', 'transfer', 'other']) method!: 'cash' | 'card' | 'transfer' | 'other';
  @ApiPropertyOptional({ enum: ['individual', 'legal'], description: 'Плательщик: физ/юр лицо' }) @IsOptional() @IsIn(['individual', 'legal']) payerType?: 'individual' | 'legal';
  @ApiPropertyOptional({ description: 'ФИО/название плательщика' }) @IsOptional() @IsString() payerName?: string;
  @ApiPropertyOptional({ enum: ['prepay100', 'prepay', 'advance', 'full', 'credit'], description: 'Признак способа расчёта (54-ФЗ)' }) @IsOptional() @IsIn(['prepay100', 'prepay', 'advance', 'full', 'credit']) settlementKind?: string;
  @ApiPropertyOptional({ description: 'Ставка НДС платежа, % (0/10/20; не задано — «Без НДС»)' }) @IsOptional() @Type(() => Number) @IsInt() vatRate?: number;
  @ApiPropertyOptional({ description: 'Дата платежа, ISO' }) @IsOptional() @IsString() paidAt?: string;
}
