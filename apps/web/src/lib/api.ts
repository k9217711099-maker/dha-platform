import type {
  AiGuestReply,
  AiThreadMessage,
  AiTelegramLink,
  BookingView,
  CalendarDay,
  CheckinView,
  CreateBookingInput,
  ChatMessage,
  Extra,
  FavoriteView,
  FiltersMeta,
  GuestProfile,
  KeysView,
  LoyaltySummary,
  NotificationItem,
  PaymentCreateResult,
  PropertyDetail,
  PropertySearchResult,
  RoomAvailability,
  SaveCheckinInput,
  SearchInput,
  TokenPair,
  UpdateProfileInput,
} from './api-types';

/**
 * База API. Приоритет — NEXT_PUBLIC_API_URL (домен/HTTPS в проде). Если не задан на
 * этапе сборки, в браузере выводим адрес из текущего хоста + порт API (:3001) — тогда
 * прод (83.166.247.226:3001) и localhost работают без build-time переменной. На сервере
 * (SSR/сборка) фолбэк — localhost.
 */
function resolveApiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL;
  if (fromEnv) return fromEnv;
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    // Локальная разработка или доступ по IP — API на том же хосте, порт 3001.
    if (hostname === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
      return `${protocol}//${hostname}:3001/api`;
    }
    // Прод по домену: API на поддомене api.<основной-домен> (за nginx+HTTPS).
    const base = hostname.replace(/^(www|admin)\./, '');
    return `${protocol}//api.${base}/api`;
  }
  return 'http://localhost:3001/api';
}

const API_BASE = resolveApiBase();

const ACCESS_KEY = 'dha_access';
const REFRESH_KEY = 'dha_refresh';

// --- Хранилище токенов ---
// MVP: localStorage. На проде refresh-токен лучше держать в httpOnly-cookie.
export const tokenStore = {
  get access() {
    return typeof window === 'undefined' ? null : localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return typeof window === 'undefined' ? null : localStorage.getItem(REFRESH_KEY);
  },
  set(pair: TokenPair) {
    localStorage.setItem(ACCESS_KEY, pair.accessToken);
    localStorage.setItem(REFRESH_KEY, pair.refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
  /** Внутренний флаг — попытка после обновления токена (защита от рекурсии). */
  _retried?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth && tokenStore.access) {
    headers.Authorization = `Bearer ${tokenStore.access}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  // Автообновление access-токена при 401
  if (res.status === 401 && opts.auth && !opts._retried && tokenStore.refresh) {
    try {
      const pair = await request<TokenPair>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken: tokenStore.refresh },
      });
      tokenStore.set(pair);
      return request<T>(path, { ...opts, _retried: true });
    } catch {
      tokenStore.clear();
    }
  }

  if (res.status === 204) return undefined as T;

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = (data.message as string) ?? `Ошибка запроса (${res.status})`;
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message);
  }
  return data as T;
}

export const api = {
  // OTP по телефону
  requestPhoneOtp: (phone: string) =>
    request<void>('/auth/otp/phone/request', { method: 'POST', body: { phone } }),
  verifyPhoneOtp: (body: {
    phone: string;
    code: string;
    acceptPersonalData: boolean;
    acceptMarketing?: boolean;
  }) => request<TokenPair>('/auth/otp/phone/verify', { method: 'POST', body }),

  // OTP по email
  requestEmailOtp: (email: string) =>
    request<void>('/auth/otp/email/request', { method: 'POST', body: { email } }),
  verifyEmailOtp: (body: {
    email: string;
    code: string;
    acceptPersonalData: boolean;
    acceptMarketing?: boolean;
  }) => request<TokenPair>('/auth/otp/email/verify', { method: 'POST', body }),

  // Email + пароль
  register: (body: {
    email: string;
    password: string;
    acceptPersonalData: boolean;
    acceptMarketing?: boolean;
  }) => request<TokenPair>('/auth/register', { method: 'POST', body }),
  login: (body: { email: string; password: string }) =>
    request<TokenPair>('/auth/login', { method: 'POST', body }),

  logout: (refreshToken: string) =>
    request<void>('/auth/logout', { method: 'POST', body: { refreshToken } }),

  // Каталог / поиск
  getFilters: () => request<FiltersMeta>('/catalog/filters'),
  search: (body: SearchInput) =>
    request<PropertySearchResult[]>('/catalog/search', { method: 'POST', body }),
  browse: (body: { propertyTypes?: string[]; districts?: string[]; amenities?: string[]; features?: string[] }) =>
    request<PropertySearchResult[]>('/catalog/browse', { method: 'POST', body }),
  getExtras: () => request<Extra[]>('/catalog/extras'),
  getProperty: (id: string) => request<PropertyDetail>(`/catalog/properties/${id}`),
  getAvailability: (params: {
    propertyId?: string;
    checkIn: string;
    checkOut: string;
    guests?: number;
    children?: number;
  }) => {
    const q = new URLSearchParams();
    if (params.propertyId) q.set('propertyId', params.propertyId);
    q.set('checkIn', params.checkIn);
    q.set('checkOut', params.checkOut);
    if (params.guests) q.set('guests', String(params.guests));
    if (params.children) q.set('children', String(params.children));
    return request<RoomAvailability[]>(`/catalog/availability?${q.toString()}`);
  },
  getPriceCalendar: (params: {
    from: string;
    days?: number;
    propertyId?: string;
    roomTypeId?: string;
    guests?: number;
    children?: number;
  }) => {
    const q = new URLSearchParams();
    q.set('from', params.from);
    if (params.days) q.set('days', String(params.days));
    if (params.propertyId) q.set('propertyId', params.propertyId);
    if (params.roomTypeId) q.set('roomTypeId', params.roomTypeId);
    if (params.guests) q.set('guests', String(params.guests));
    if (params.children) q.set('children', String(params.children));
    return request<CalendarDay[]>(`/catalog/price-calendar?${q.toString()}`);
  },

  // Бронирования
  createBooking: (body: CreateBookingInput) =>
    request<BookingView>('/bookings', { method: 'POST', body, auth: true }),
  createBookingGroup: (body: {
    items: {
      roomTypeId: string;
      ratePlanId: string;
      checkIn: string;
      checkOut: string;
      guests: number;
      roomsCount?: number;
      extras?: { extraId: string; qty?: number }[];
    }[];
    promoCode?: string;
    comment?: string;
    pointsToRedeem?: number;
    channel?: string;
  }) =>
    request<{ groupId: string; bookings: BookingView[]; totalPayable: number }>('/bookings/group', {
      method: 'POST',
      body,
      auth: true,
    }),
  createGroupPayment: (groupId: string) =>
    request<PaymentCreateResult>('/payments/group', { method: 'POST', body: { groupId }, auth: true }),
  listBookings: () => request<BookingView[]>('/bookings', { auth: true }),
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

  // Цифровой ключ (несколько дверей)
  getKey: (bookingId: string) => request<KeysView>(`/bookings/${bookingId}/key`, { auth: true }),
  issueKey: (bookingId: string) =>
    request<KeysView>(`/bookings/${bookingId}/key`, { method: 'POST', auth: true }),
  openDoor: (bookingId: string, lockId: string) =>
    request<{ ok: true }>(`/bookings/${bookingId}/key/open`, {
      method: 'POST',
      body: { lockId },
      auth: true,
    }),
  uploadPassport: async (bookingId: string, file: File, page: 'main' | 'registration' = 'main'): Promise<{ documentId: string }> => {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${API_BASE}/bookings/${bookingId}/checkin/passport?page=${page}`, {
      method: 'POST',
      headers: tokenStore.access ? { Authorization: `Bearer ${tokenStore.access}` } : {},
      body: fd,
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      throw new ApiError(res.status, data.message ?? 'Ошибка загрузки');
    }
    return res.json() as Promise<{ documentId: string }>;
  },

  // Чат с ресепшен
  getChat: () => request<ChatMessage[]>('/chat', { auth: true }),
  sendChat: (text: string, topic?: string) =>
    request<ChatMessage>('/chat', { method: 'POST', body: { text, topic }, auth: true }),

  // AI-администратор (гостевой агент). Авторизация опциональна: auth:true цепляет
  // токен, если гость залогинен, иначе запрос анонимный.
  aiGuestMessage: (text: string, conversationId?: string) =>
    request<AiGuestReply>('/ai/guest/message', {
      method: 'POST',
      body: { text, conversationId },
      auth: true,
    }),
  // История диалога — виджет опрашивает её после эскалации, чтобы показать ответы оператора.
  aiGuestConversation: (id: string) =>
    request<AiThreadMessage[]>(`/ai/guest/conversation/${id}`),
  // Привязка Telegram к аккаунту (§13): токен + deep-link на бота.
  aiTelegramLinkToken: () =>
    request<AiTelegramLink>('/ai/telegram/link-token', { method: 'POST', auth: true }),

  // Аналитика (публичный трекинг)
  track: (type: string, props?: Record<string, unknown>) =>
    request<void>('/analytics/track', { method: 'POST', body: { type, props } }).catch(() => undefined),

  // Уведомления
  getNotifications: () => request<NotificationItem[]>('/notifications', { auth: true }),

  // Лояльность
  getLoyaltySummary: () => request<LoyaltySummary>('/loyalty/summary', { auth: true }),

  // Избранное (категории)
  listFavorites: () => request<FavoriteView[]>('/favorites', { auth: true }),
  favoriteIds: () => request<string[]>('/favorites/ids', { auth: true }),
  addFavorite: (roomTypeId: string) =>
    request<{ ok: true }>('/favorites', { method: 'POST', body: { roomTypeId }, auth: true }),
  removeFavorite: (roomTypeId: string) =>
    request<{ ok: true }>(`/favorites/${roomTypeId}`, { method: 'DELETE', auth: true }),

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
