import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from './config';

const ACCESS = 'dha_access';
const REFRESH = 'dha_refresh';

export const tokenStore = {
  async get() {
    return AsyncStorage.getItem(ACCESS);
  },
  async getRefresh() {
    return AsyncStorage.getItem(REFRESH);
  },
  async set(pair: { accessToken: string; refreshToken: string }) {
    await AsyncStorage.multiSet([
      [ACCESS, pair.accessToken],
      [REFRESH, pair.refreshToken],
    ]);
  },
  async clear() {
    await AsyncStorage.multiRemove([ACCESS, REFRESH]);
  },
};

interface ReqOpts {
  method?: string;
  body?: unknown;
  auth?: boolean;
  _retried?: boolean;
}

async function request<T>(path: string, opts: ReqOpts = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth) {
    const token = await tokenStore.get();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  // Автообновление access-токена при 401 (как в вебе)
  if (res.status === 401 && opts.auth && !opts._retried) {
    const refreshToken = await tokenStore.getRefresh();
    if (refreshToken) {
      try {
        const pair = await request<TokenPair>('/auth/refresh', {
          method: 'POST',
          body: { refreshToken },
        });
        await tokenStore.set(pair);
        return request<T>(path, { ...opts, _retried: true });
      } catch {
        await tokenStore.clear();
      }
    }
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const m = data.message;
    throw new Error(Array.isArray(m) ? m.join(', ') : ((m as string) ?? `Ошибка ${res.status}`));
  }
  return data as T;
}

// --- Типы (зеркало backend / apps/web api-types) ---
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
export interface ConsentMap {
  PERSONAL_DATA: boolean;
  MARKETING: boolean;
  HOUSE_RULES: boolean;
}
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
export interface SearchResult {
  propertyId: string;
  name: string;
  type: string;
  district: string | null;
  address: string;
  amenities: string[];
  fromPrice: number;
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
}
export interface RoomType {
  id: string;
  name: string;
  capacity: number;
  bedType: string | null;
  areaSqm: number | null;
  description: string | null;
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
  roomTypes: RoomType[];
}
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
  ratePlanName: string;
  refundable: boolean;
  cancellationPolicy: string | null;
  houseRules: string | null;
  totalPrice: number;
  pointsReserved: number;
  pointsRedeemed: number;
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
  comment?: string;
  promoCode?: string;
  pointsToRedeem?: number;
  channel?: string;
}
export interface PaymentCreateResult {
  paymentId: string;
  gatewayPaymentId: string;
  status: string;
  confirmationUrl: string | null;
  amount: number;
}
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
export interface PointTxn {
  amount: number;
  status: string;
  reason: string;
  createdAt: string;
}
export interface LoyaltySummary {
  tier: string;
  availableBalance: number;
  pendingBalance: number;
  qualifyingAmountRub: number;
  qualifyingNights: number;
  progress: { current: string; next: string | null; amountToNext: number; nightsToNext: number };
  nearestExpiry: string | null;
  history: PointTxn[];
}
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
export interface UploadFile {
  uri: string;
  name: string;
  type: string;
}

/** Ответ гостевого AI-агента (POST /ai/guest/message). */
export interface AiGuestReply {
  conversationId: string;
  reply: string;
  escalated: boolean;
}

/** Сообщение треда диалога (опрос ответов оператора после эскалации). */
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

export const api = {
  // AI-администратор (гостевой агент). auth:true — опц. Bearer (гость залогинен).
  aiGuestMessage: (text: string, conversationId?: string) =>
    request<AiGuestReply>('/ai/guest/message', {
      method: 'POST',
      body: { text, conversationId },
      auth: true,
    }),
  // История диалога — опрашивается после эскалации, чтобы показать ответы оператора.
  aiGuestConversation: (id: string) =>
    request<AiThreadMessage[]>(`/ai/guest/conversation/${id}`),
  aiTelegramLinkToken: () =>
    request<AiTelegramLink>('/ai/telegram/link-token', { method: 'POST', auth: true }),
  // Auth
  login: (email: string, password: string) =>
    request<TokenPair>('/auth/login', { method: 'POST', body: { email, password } }),
  register: (email: string, password: string) =>
    request<TokenPair>('/auth/register', {
      method: 'POST',
      body: { email, password, acceptPersonalData: true },
    }),
  requestPhoneOtp: (phone: string) =>
    request<void>('/auth/otp/phone/request', { method: 'POST', body: { phone } }),
  verifyPhoneOtp: (body: { phone: string; code: string; acceptPersonalData: boolean }) =>
    request<TokenPair>('/auth/otp/phone/verify', { method: 'POST', body }),

  // Каталог / поиск
  search: (body: { checkIn: string; checkOut: string; guests: number }) =>
    request<SearchResult[]>('/catalog/search', { method: 'POST', body }),
  getProperty: (id: string) => request<PropertyDetail>(`/catalog/properties/${id}`),
  getAvailability: (p: { propertyId: string; checkIn: string; checkOut: string; guests?: number }) => {
    const q = new URLSearchParams();
    q.set('propertyId', p.propertyId);
    q.set('checkIn', p.checkIn);
    q.set('checkOut', p.checkOut);
    if (p.guests) q.set('guests', String(p.guests));
    return request<RoomAvailability[]>(`/catalog/availability?${q.toString()}`);
  },

  // Бронирования
  createBooking: (body: CreateBookingInput) =>
    request<BookingView>('/bookings', { method: 'POST', body, auth: true }),
  bookings: () => request<BookingView[]>('/bookings', { auth: true }),
  getBooking: (id: string) => request<BookingView>(`/bookings/${id}`, { auth: true }),
  cancelBooking: (id: string, reason?: string) =>
    request<BookingView>(`/bookings/${id}/cancel`, { method: 'POST', body: { reason }, auth: true }),

  // Платежи
  createPayment: (bookingId: string) =>
    request<PaymentCreateResult>('/payments', { method: 'POST', body: { bookingId }, auth: true }),
  simulatePayment: (paymentId: string) =>
    request<void>(`/payments/${paymentId}/simulate`, { method: 'POST', auth: true }),

  // Онлайн-регистрация
  getCheckin: (bookingId: string) =>
    request<CheckinView>(`/bookings/${bookingId}/checkin`, { auth: true }),
  saveCheckin: (bookingId: string, body: SaveCheckinInput) =>
    request<CheckinView>(`/bookings/${bookingId}/checkin`, { method: 'PUT', body, auth: true }),
  submitCheckin: (bookingId: string) =>
    request<CheckinView>(`/bookings/${bookingId}/checkin/submit`, { method: 'POST', auth: true }),
  uploadPassport: async (bookingId: string, file: UploadFile): Promise<{ documentId: string }> => {
    const fd = new FormData();
    // RN multipart: файл передаётся как { uri, name, type }
    fd.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
    const token = await tokenStore.get();
    const res = await fetch(`${API_BASE}/bookings/${bookingId}/checkin/passport`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: fd,
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(data.message ?? 'Ошибка загрузки');
    }
    return res.json() as Promise<{ documentId: string }>;
  },

  // Ключ
  getKey: (bookingId: string) => request<KeysView>(`/bookings/${bookingId}/key`, { auth: true }),
  issueKey: (bookingId: string) =>
    request<KeysView>(`/bookings/${bookingId}/key`, { method: 'POST', auth: true }),
  openDoor: (bookingId: string, lockId: string) =>
    request<{ ok: true }>(`/bookings/${bookingId}/key/open`, {
      method: 'POST',
      body: { lockId },
      auth: true,
    }),

  // Лояльность
  loyalty: () => request<LoyaltySummary>('/loyalty/summary', { auth: true }),

  // Профиль
  getMe: () => request<GuestProfile>('/guests/me', { auth: true }),
  updateProfile: (body: UpdateProfileInput) =>
    request<GuestProfile>('/guests/me', { method: 'PATCH', body, auth: true }),
  updateMarketingConsent: (granted: boolean) =>
    request<GuestProfile>('/guests/me/consents/marketing', {
      method: 'PUT',
      body: { granted },
      auth: true,
    }),
};
