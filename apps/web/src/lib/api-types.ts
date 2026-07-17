/** Типы ответов backend D H&A (соответствуют DTO apps/api). */

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type ConsentMap = {
  PERSONAL_DATA: boolean;
  MARKETING: boolean;
  HOUSE_RULES: boolean;
};

export interface GuestProfile {
  id: string;
  phone: string | null;
  email: string | null;
  phoneVerified: boolean;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  birthDate: string | null;
  citizenship: string | null;
  loyaltyTier: string;
  hasPassport: boolean;
  consents: ConsentMap;
}

export interface UpdateProfileInput {
  firstName?: string;
  lastName?: string;
  middleName?: string;
  birthDate?: string;
  citizenship?: string;
}

// --- Каталог / поиск (блок 2–3) ---

export interface LabeledOption {
  value: string;
  label: string;
}

export interface PriceRangeMeta {
  code: string;
  level: number;
  indicator: string;
  minRub: number;
  maxRub: number | null;
}

export interface FiltersMeta {
  propertyTypes: LabeledOption[];
  districts: LabeledOption[];
  capacities: LabeledOption[];
  amenityCategories: { value: string; label: string; items: { code: string; label: string; icon?: string | null }[] }[];
  features: { code: string; label: string }[];
  priceRanges: PriceRangeMeta[];
  /** Кэшбэк баллами за регистрацию гостя, %. */
  registrationCashbackPercent: number;
}

/** День календаря цен/доступности (пикер дат). */
export interface CalendarDay {
  date: string;
  available: boolean;
  minNightlyPrice: number | null;
}

export interface RatePlan {
  id: string;
  name: string;
  perNight: number;
  totalPrice: number;
  refundable: boolean;
  cancellationPolicy: string;
}

export interface RoomAvailability {
  roomTypeId: string;
  roomTypeName: string;
  propertyId: string;
  propertyName: string;
  capacity: number;
  available: number;
  nights: number;
  minNights: number;
  ratePlans: RatePlan[];
  photos: string[];
  amenities: string[];
  areaSqm: number | null;
  bedType: string | null;
  description: string | null;
}

export interface PropertySearchResult {
  propertyId: string;
  name: string;
  type: string;
  district: string | null;
  address: string;
  photos: string[];
  amenities: string[];
  features: string[];
  latitude: number | null;
  longitude: number | null;
  fromPrice: number;
  rooms: RoomAvailability[];
}

export interface FavoriteView {
  roomTypeId: string;
  roomTypeName: string;
  propertyId: string;
  propertyName: string;
  address: string;
  capacity: number;
  areaSqm: number | null;
  bedType: string | null;
  amenities: string[];
  photos: string[];
  addedAt: string;
}

export interface RoomType {
  id: string;
  name: string;
  capacity: number;
  bedType: string | null;
  areaSqm: number | null;
  description: string | null;
  amenities: string[];
  photos: string[];
}

export interface PropertyDetail {
  id: string;
  name: string;
  type: string;
  district: string | null;
  city: string;
  address: string;
  description: string | null;
  amenities: string[];
  features: string[];
  photos: string[];
  latitude: number | null;
  longitude: number | null;
  roomTypes: RoomType[];
}

export interface SearchInput {
  checkIn: string;
  checkOut: string;
  guests?: number;
  children?: number;
  propertyTypes?: string[];
  districts?: string[];
  amenities?: string[];
  features?: string[];
  priceRanges?: string[];
}

// --- Бронирования (блок 4) ---

export type BookingSection = 'CURRENT' | 'UPCOMING' | 'PAST' | 'CANCELLED';

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
  checkIn: string;
  checkOut: string;
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
  extrasTotal: number;
  extras: { name: string; unit: string; unitPrice: number; qty: number; total: number }[];
  payableAmount: number;
  canCancel: boolean;
  cancelReason: string | null;
  stay: StayInfo | null;
  createdAt: string;
}

export interface CreateBookingInput {
  roomTypeId: string;
  ratePlanId: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  roomsCount?: number;
  comment?: string;
  promoCode?: string;
  pointsToRedeem?: number;
  channel?: string;
}

// --- Доп-услуги (апселлы) ---
export type ExtraUnit = 'PER_STAY' | 'PER_NIGHT' | 'PER_PERSON' | 'PER_PERSON_NIGHT';
export interface ExtraPeriod {
  from: string;
  until: string;
}
export interface Extra {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  imageUrl: string | null;
  price: number;
  unit: ExtraUnit;
  maxQty: number;
  quantitySelectable: boolean;
  periods: ExtraPeriod[] | null;
  roomTypeIds: string[];
  /** Тарифы (kind), в которые услуга входит бесплатно. */
  includedRatePlanKinds: string[];
}

// --- Платежи (блок 5) ---

export interface PaymentCreateResult {
  paymentId: string;
  gatewayPaymentId: string;
  status: string;
  /** URL внешней страницы оплаты (реальный шлюз) или null (демо-режим). */
  confirmationUrl: string | null;
  amount: number;
}

// --- Лояльность (блок 7) ---

export interface PointTxn {
  amount: number;
  status: string;
  reason: string;
  createdAt: string;
}

export interface TierProgress {
  current: string;
  next: string | null;
  amountToNext: number;
  nightsToNext: number;
}

export interface LoyaltySummary {
  tier: string;
  availableBalance: number;
  pendingBalance: number;
  qualifyingAmountRub: number;
  qualifyingNights: number;
  progress: TierProgress;
  nearestExpiry: string | null;
  history: PointTxn[];
}

// --- Онлайн-регистрация (блок 8) ---

export type CheckinStatus =
  | 'NOT_STARTED'
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'NEEDS_FIX';

export interface CheckinView {
  id: string;
  bookingId: string;
  status: CheckinStatus;
  arrivalTime: string | null;
  departureTime: string | null;
  adults: number;
  children: { age: number }[];
  hasPassportData: boolean;
  documentsCount: number;
  consentsSigned: boolean;
  houseRulesAccepted: boolean;
  rejectionReason: string | null;
  instructions: string | null;
  submittedAt: string | null;
}

export interface SaveCheckinInput {
  arrivalTime?: string;
  departureTime?: string;
  adults?: number;
  children?: { age: number }[];
  passport?: { series: string; number: string; issuedBy?: string; issuedDate?: string };
  consentsSigned?: boolean;
  houseRulesAccepted?: boolean;
}

// --- Цифровой ключ (блок 9) ---

export interface KeyDoor {
  doorName: string;
  target: string;
  status: string;
  pin: string | null;
  ttlockLockId: string;
  canRemoteOpen: boolean;
}

export interface KeysView {
  eligible: boolean;
  reasons: string[];
  validFrom: string | null;
  validUntil: string | null;
  doors: KeyDoor[];
}

// --- Чат с ресепшен (блок 10) ---

export interface ChatMessage {
  id: string;
  direction: 'GUEST' | 'STAFF';
  topic: string | null;
  text: string;
  createdAt: string;
}

/** Ответ гостевого AI-агента (POST /ai/guest/message). */
export interface AiGuestReply {
  conversationId: string;
  reply: string;
  escalated: boolean;
}

/** Сообщение треда диалога (web/app опрашивают /ai/guest/conversation/:id после эскалации). */
export interface AiThreadMessage {
  role: 'user' | 'ai' | 'staff';
  text: string;
  createdAt: string;
}

/** Токен и deep-link привязки Telegram к аккаунту гостя (§13). */
export interface AiTelegramLink {
  token: string;
  deepLink: string | null;
  expiresInSec: number;
}

// --- Уведомления (блок 11) ---

export interface NotificationItem {
  id: string;
  scenario: string;
  channel: string;
  title: string;
  body: string;
  status: string;
  createdAt: string;
}
