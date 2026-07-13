import type { Booking, BookingExtra, Property, RoomType } from '@prisma/client';
import { BookingSection, BookingStatus, classifyBookingSection } from '@dha/domain';

/** Информация для проживания, показывается только для текущих броней (§7.1). */
export interface StayInfo {
  wifiName: string | null;
  wifiPassword: string | null;
  instructions: string | null;
}

export interface BookingView {
  id: string;
  status: string;
  section: BookingSection;
  paymentStatus: string;
  propertyId: string;
  propertyName: string;
  address: string;
  roomTypeName: string;
  checkIn: Date;
  checkOut: Date;
  checkInTime: string | null;
  checkOutTime: string | null;
  nights: number;
  guests: number;
  roomsCount: number;
  ratePlanName: string;
  refundable: boolean;
  cancellationPolicy: string | null;
  houseRules: string | null;
  totalPrice: number;
  pointsReserved: number;
  pointsRedeemed: number;
  /** Сумма доп-услуг, ₽. */
  extrasTotal: number;
  /** Выбранные доп-услуги. */
  extras: { name: string; unit: string; unitPrice: number; qty: number; total: number }[];
  /** К оплате: проживание − баллы + доп-услуги. */
  payableAmount: number;
  /** Можно ли отменить (возвратный тариф, подтверждена, предстоящая). */
  canCancel: boolean;
  cancelReason: string | null;
  /** Информация для заселения — только для текущих броней. */
  stay: StayInfo | null;
  createdAt: Date;
}

type BookingWithRelations = Booking & {
  property: Property;
  roomType: RoomType;
  extras?: BookingExtra[];
};

/** Представление брони для клиента: добавляет раздел (§7), сумму к оплате и действия. */
export function toBookingView(b: BookingWithRelations, now: Date = new Date()): BookingView {
  const section = classifyBookingSection(
    { status: b.status as unknown as BookingStatus, checkinAt: b.checkIn, checkoutAt: b.checkOut },
    now,
  );
  const canCancel = b.refundable && b.status === 'CONFIRMED' && section === BookingSection.UPCOMING;

  return {
    id: b.id,
    status: b.status,
    section,
    paymentStatus: b.paymentStatus,
    propertyId: b.propertyId,
    propertyName: b.property.name,
    address: b.property.address,
    roomTypeName: b.roomType.name,
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    checkInTime: b.property.checkInTime,
    checkOutTime: b.property.checkOutTime,
    nights: b.nights,
    guests: b.guests,
    roomsCount: b.roomsCount,
    ratePlanName: b.ratePlanName,
    refundable: b.refundable,
    cancellationPolicy: b.cancellationPolicy,
    houseRules: b.property.houseRules,
    totalPrice: b.totalPrice,
    pointsReserved: b.pointsReserved,
    pointsRedeemed: b.pointsRedeemed,
    extrasTotal: b.extrasTotal,
    extras: (b.extras ?? []).map((e) => ({
      name: e.name,
      unit: e.unit,
      unitPrice: e.unitPrice,
      qty: e.qty,
      total: e.total,
    })),
    payableAmount: Math.max(b.totalPrice - b.pointsRedeemed, 0) + b.extrasTotal,
    canCancel,
    cancelReason: b.cancelReason,
    stay:
      section === BookingSection.CURRENT
        ? {
            wifiName: b.property.wifiName,
            wifiPassword: b.property.wifiPassword,
            instructions: b.property.instructions,
          }
        : null,
    createdAt: b.createdAt,
  };
}
