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
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '');
const TOKEN_KEY = 'dha_admin_token';

/** Полный URL к загруженному на сервер файлу (/uploads/...). Абсолютные ссылки — как есть. */
export function fileUrl(path: string | null | undefined): string {
  if (!path) return '';
  return /^https?:\/\//.test(path) ? path : `${API_ORIGIN}${path}`;
}

export const adminToken = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

/** URL SSE-потока событий мессенджера (EventSource; токен — в query). null без входа. */
export function staffStreamUrl(): string | null {
  const t = adminToken.get();
  return t ? `${API_BASE}/staff-chat/stream?token=${encodeURIComponent(t)}` : null;
}

/** URL SSE-потока событий задач/уборок (TASKS-HOUSEKEEPING-TZ §11). null без входа. */
export function opsStreamUrl(): string | null {
  const t = adminToken.get();
  return t ? `${API_BASE}/v1/ops/stream?token=${encodeURIComponent(t)}` : null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...opts.headers };
  const token = adminToken.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  // Просроченный/недействительный токен — выходим на вход (иначе страницы молча висят)
  if (res.status === 401 && path !== '/admin/auth/login') {
    adminToken.clear();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiError(401, 'Сессия истекла, войдите снова');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const m = data.message;
    throw new ApiError(res.status, Array.isArray(m) ? m.join(', ') : ((m as string) ?? `Ошибка ${res.status}`));
  }
  return data as T;
}

/** Скачать файл (xlsx-экспорт) с авторизацией. */
async function download(path: string, filename: string): Promise<void> {
  const token = adminToken.get();
  const res = await fetch(`${API_BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (res.status === 401) {
    adminToken.clear();
    if (typeof window !== 'undefined') window.location.href = '/login';
    throw new ApiError(401, 'Сессия истекла, войдите снова');
  }
  if (!res.ok) throw new ApiError(res.status, `Ошибка экспорта (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Загрузить файл (xlsx-импорт) с авторизацией. */
async function upload<T>(path: string, file: File, fields: Record<string, string> = {}): Promise<T> {
  const token = adminToken.get();
  const fd = new FormData();
  fd.append('file', file);
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, (data.message as string) ?? `Ошибка ${res.status}`);
  return data as T;
}

/** Публичный URL ссылки /api/s/<token> (KB-DRIVE-TZ.md §5.4). */
export function publicLinkUrl(token: string): string {
  return `${API_BASE}/s/${token}`;
}

// --- Типы ---
export interface SyncLog {
  id: string;
  integration: string;
  operation: string;
  status: string;
  message: string | null;
  itemsSynced: number;
  startedAt: string;
  finishedAt: string | null;
}
export interface CheckinQueueItem {
  bookingId: string;
  guestId: string;
  status: string;
  property: string;
  adults: number;
  documentsCount: number;
  submittedAt: string | null;
  passportCheckStatus?: 'VALID' | 'INVALID' | 'MANUAL' | null;
  passportCheckNote?: string | null;
}
/** Канал коммуникации гостевого AI-агента (вкладка «Интеграции»). */
export interface AiChannel {
  id: 'web' | 'app' | 'telegram' | 'tg_direct' | 'max' | 'whatsapp' | 'umnico' | 'email' | 'avito';
  name: string;
  category: 'guest' | 'notifications';
  description: string;
  available: boolean;
  connected: boolean;
  needsSetup: boolean;
  setup?: string;
  /** Есть ли тумблер вкл/выкл (web/app — из коробки, без тумблера). */
  toggleable: boolean;
  /** Включён ли канал. */
  enabled: boolean;
}

/** Публичная конфигурация Telegram-бота (без секретов). */
export interface TelegramAdminConfig {
  botUsername: string;
  tokenSet: boolean;
  webhookSecretSet: boolean;
  connected: boolean;
  botLink: string | null;
}

/** Публичная конфигурация MAX-бота (без секретов). */
export interface MaxAdminConfig {
  botUsername: string;
  tokenSet: boolean;
  webhookSecretSet: boolean;
  connected: boolean;
  botLink: string | null;
}

/** Статус подключения WhatsApp (Baileys). */
export interface WaState {
  status: 'disabled' | 'disconnected' | 'connecting' | 'qr' | 'connected';
  qr: string | null;
  me: string | null;
  message: string;
}

/** Статус Telegram Direct (userbot, GramJS). */
export interface TgUserbotState {
  status: 'disabled' | 'disconnected' | 'awaiting_qr' | 'awaiting_code' | 'awaiting_password' | 'connected';
  phone: string | null;
  me: string | null;
  qr: string | null;
  message: string;
}

/** Канал, подключённый в Umnico. */
export interface UmnicoChannel {
  id: number;
  type: string;
  login: string;
  status: string;
  label: string;
}
/** Конфигурация Umnico (без токена) + подключённые каналы. */
export interface UmnicoAdminConfig {
  tokenSet: boolean;
  connected: boolean;
  channels: UmnicoChannel[];
}

/** Публичная конфигурация SMTP (без пароля). */
export interface EmailAdminConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from: string;
  passSet: boolean;
  proxySet: boolean;
  configured: boolean;
}

export interface Promocode {
  id: string;
  code: string;
  comment: string | null;
  type: string;
  value: number;
  application: 'DISCOUNT' | 'ROOM_UPGRADE' | 'FREE_SERVICE';
  active: boolean;
  validFrom: string | null;
  validUntil: string | null;
  maxUses: number | null;
  usedCount: number;
  roomTypeIds: string[];
  ratePlanIds: string[];
  showOnlyMatchingCategories: boolean;
  showOnlyMatchingTariffs: boolean;
  source: string | null;
  bookingMethod: string | null;
  referralSource: string | null;
  discountReason: string | null;
  autoApplyOnEmail: boolean;
  ignoreRestrictions: boolean;
  upgradeFromRoomTypeId: string | null;
  upgradeToRoomTypeId: string | null;
  freeExtraId: string | null;
}
export type MarketingKind = 'BOOKING_METHOD' | 'REFERRAL_SOURCE' | 'DISCOUNT_REASON' | 'DISCOUNT_CAUSE' | 'CANCEL_REASON';
export interface MarketingOption {
  id: string;
  kind: MarketingKind;
  label: string;
  sortOrder: number;
  active: boolean;
}
/** Тело создания/редактирования промокода (полная форма). */
export interface PromocodeInput {
  code: string;
  value: number;
  comment?: string;
  type?: string;
  application?: string;
  validFrom?: string;
  validUntil?: string;
  maxUses?: number;
  roomTypeIds?: string[];
  ratePlanIds?: string[];
  showOnlyMatchingCategories?: boolean;
  showOnlyMatchingTariffs?: boolean;
  source?: string;
  bookingMethod?: string;
  referralSource?: string;
  discountReason?: string;
  autoApplyOnEmail?: boolean;
  ignoreRestrictions?: boolean;
  upgradeFromRoomTypeId?: string;
  upgradeToRoomTypeId?: string;
  freeExtraId?: string;
  active?: boolean;
}
export interface GuestSearchResult {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  loyaltyTier: string;
}
/** Строка списка базы гостей (§9). */
export interface GuestListRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  loyaltyTier: string;
  guestNotes: string | null;
  createdAt: string;
  bookingsCount: number;
}
export interface GuestDetails {
  id: string;
  phone: string | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  guestNotes: string | null;
  loyaltyTier: string;
  loyalty: { availableBalance: number; pendingBalance: number; tier: string };
  bookings: {
    id: string;
    property: string;
    checkIn: string;
    checkOut: string;
    status: string;
    paymentStatus: string;
    totalPrice: number;
  }[];
}

export interface AnalyticsMetrics {
  installs: number;
  registrations: number;
  bookings: number;
  directBookings: number;
  paidBookings: number;
  directShare: number;
  averageCheckRub: number;
  conversionRate: number;
  repeatRate: number;
  pointsAccrued: number;
  pointsSpent: number;
  keyErrors: number;
  chatResponseAvgMinutes: number;
  requests: number;
  upsells: number;
  reviews: number;
}

export interface TtlockLock {
  ttlockLockId: string;
  name: string;
  hasGateway: boolean;
}
export type LockCoverage = 'ROOM' | 'PROPERTY' | 'FLOOR' | 'ROOM_LIST';
export interface DbLock {
  id: string;
  propertyId: string;
  ttlockLockId: string;
  name: string;
  target: string;
  coverage: LockCoverage;
  coverageFloor: string | null;
  hasGateway: boolean;
  roomLinks: { roomId: string }[];
  property?: { name: string };
}
export interface PropertyTree {
  id: string;
  name: string;
  roomTypes: { id: string; name: string }[];
}
export interface PasscodeResult {
  ttlockKeyId: string;
  pin: string;
}
export interface EkeyResult {
  keyId: string;
}
export interface LockRecord {
  type: string;
  success: boolean;
  who: string;
  at: number;
}
export interface TtlockCreds {
  username: string;
  source: string;
  hasPassword: boolean;
}

export interface Amenity {
  id: string;
  code: string;
  label: string;
  category: string;
  icon: string | null;
  isFilter: boolean;
  sortOrder: number;
  active: boolean;
}
export interface AmenityCategoryOption {
  value: string;
  label: string;
}
export interface RoomTypeAdmin {
  id: string;
  name: string;
  capacity: number;
  bedType: string | null;
  areaSqm: number | null;
  description: string | null;
  amenities: string[];
  photos: string[];
  active: boolean;
  property: { id: string; name: string };
}

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
  unit: string;
  maxQty: number;
  quantitySelectable: boolean;
  periods: ExtraPeriod[] | null;
  roomTypeIds: string[];
  includedRatePlanKinds: string[];
  sortOrder: number;
  active: boolean;
}
export interface RatePlanKind {
  kind: string;
  label: string;
}

export interface AdminMe {
  id: string;
  email: string;
  name: string | null;
  roleKey: string;
  roleName: string;
  permissions: string[];
}
export interface PermissionDef {
  key: string;
  label: string;
}
export interface Role {
  id: string;
  key: string;
  name: string;
  permissions: string[];
  system?: boolean;
}
export interface AdminUserRow {
  id: string;
  email: string;
  name: string | null;
  roleKey: string | null;
  positionId: string | null;
  groupIds: string[];
  allowedAddressIds: string[];
  active: boolean;
}
export interface Position {
  id: string;
  name: string;
  defaultRoleKey: string | null;
}
export interface EmployeeFieldDef {
  id: string;
  name: string;
  editableBy: 'SELF' | 'MANAGER' | 'BOTH';
  order: number;
}
export interface EmployeeCard {
  id: string;
  email: string;
  name: string | null;
  roleKey: string | null;
  roleName?: string | null;
  positionId: string | null;
  positionName?: string | null;
  groupIds?: string[];
  groupNames?: string[];
  allowedAddressIds: string[];
  active: boolean;
  avatarUrl: string | null;
  phone: string | null;
  birthday: string | null;
  hireDate: string | null;
  hobby: string | null;
  about: string | null;
  customFields: Record<string, string>;
  fieldDefs: EmployeeFieldDef[];
}

/** Публичный профиль коллеги (карточка из мессенджера). */
export interface StaffPublicProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  phone: string | null;
  birthday: string | null;
  hobby: string | null;
  about: string | null;
  positionName: string | null;
  roleName: string | null;
  groupNames: string[];
  active: boolean;
  online: boolean;
}

// ─── Складской учёт ───
export interface WhOption {
  value: string;
  label: string;
}
export interface WhMeta {
  docTypes: WhOption[];
  docStatuses: WhOption[];
  writeOffReasons: WhOption[];
  normUnits: WhOption[];
  addressTypes: WhOption[];
  warehouseTypes: WhOption[];
  writeOffApprovalLimit?: number;
}
export interface WhAddress {
  id: string;
  name: string;
  fullAddress: string | null;
  type: string;
  roomsCount: number | null;
  responsible: string | null;
  active: boolean;
  warehouses?: { id: string; name: string; type: string; active: boolean }[];
}
export interface WhWarehouse {
  id: string;
  name: string;
  type: string;
  addressId: string | null;
  responsible: string | null;
  active: boolean;
  address?: { id: string; name: string } | null;
}
export interface WhCategory {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
}
export interface WhItem {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  categoryId: string | null;
  unit: string;
  minStock: number | null;
  maxStock: number | null;
  parStock: number | null;
  lastPurchasePrice: number | null;
  avgPrice: number | null;
  trackExpiry: boolean;
  trackBatches: boolean;
  active: boolean;
  category?: { id: string; name: string } | null;
}
export interface WhSupplier {
  id: string;
  name: string;
  inn: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  paymentTerms: string | null;
  active: boolean;
}
export interface WhBalanceRow {
  id: string;
  warehouseId: string;
  warehouseName: string;
  warehouseType: string;
  addressId: string | null;
  addressName: string | null;
  itemId: string;
  itemName: string;
  sku: string | null;
  unit: string;
  category: string | null;
  batch: string | null;
  expiryDate: string | null;
  quantity: number;
  available: number;
  minStock: number | null;
  belowMin: boolean;
  avgCost: number | null;
  amount: number | null;
}
export interface WhDocumentRow {
  id: string;
  number: string;
  type: string;
  status: string;
  docDate: string;
  amount: number;
  externalRef: string | null;
  reason?: string | null;
  discrepancy?: boolean;
  supplier: { id: string; name: string } | null;
  _count?: { lines: number };
}
export interface WhDocumentLine {
  id: string;
  itemId: string;
  quantity: number;
  price: number;
  amount: number;
  batch: string | null;
  expiryDate: string | null;
  unit: string | null;
  shippedQty?: number | null;
  receivedQty?: number | null;
  item: { id: string; name: string; unit: string; sku: string | null };
}
export interface WhDocumentDetail extends WhDocumentRow {
  comment: string | null;
  toWarehouseId: string | null;
  lines: WhDocumentLine[];
}
export interface WhDashboard {
  totalStockValue: number | null;
  positionsCount: number;
  belowMinCount: number;
  expiringCount: number;
  urgentRequests: number;
  lowStock: { name: string; qty: number; minStock: number | null }[];
  recentMovements: {
    id: string;
    date: string;
    documentType: string;
    itemName: string;
    unit: string;
    warehouseName: string;
    quantityIn: number;
    quantityOut: number;
  }[];
}
export interface WhAuditEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  payload: Record<string, unknown> | null;
  at: string;
  actorName: string | null;
}
export interface ReceiptLineInput {
  itemId: string;
  quantity: number;
  price?: number;
  batch?: string;
  expiryDate?: string;
}
export interface WhRecommendation {
  itemId: string;
  name: string;
  unit: string;
  par: number;
  available: number;
  recommend: number;
}
export interface WhRequestRow {
  id: string;
  number: string;
  addressId: string | null;
  status: string;
  priority: string;
  desiredDate: string | null;
  comment: string | null;
  createdAt: string;
  _count?: { lines: number };
}
export interface WhRequestDetail extends WhRequestRow {
  lines: { id: string; itemId: string; quantity: number; comment: string | null; item: { id: string; name: string; unit: string } }[];
}
export interface RequestLineInput {
  itemId: string;
  quantity: number;
  comment?: string;
}
export interface WhInventoryRow {
  id: string;
  number: string;
  warehouseId: string | null;
  addressId: string | null;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  _count?: { lines: number };
}
export interface WhInventoryLineView {
  id: string;
  itemId: string;
  batch: string | null;
  bookQuantity: number;
  factQuantity: number | null;
  price: number;
  reason: string | null;
  deviation: number | null;
  deviationMoney: number | null;
  item: { id: string; name: string; unit: string };
}
export interface WhInventoryDetail extends WhInventoryRow {
  discrepancyMoney: number;
  comment: string | null;
  lines: WhInventoryLineView[];
}
export interface InventoryFactInput {
  lineId: string;
  factQuantity: number;
  reason?: string;
}
export interface WhNorm {
  id: string;
  itemId: string;
  addressId: string | null;
  roomCategory: string | null;
  unit: string;
  normQuantity: number;
  validFrom: string | null;
  validUntil: string | null;
  comment: string | null;
  item: { id: string; name: string; unit: string };
}
export interface WhOverspendRow {
  itemId: string;
  name: string;
  unit: string;
  norm: number;
  normUnit: string;
  normative: number;
  actual: number;
  overspend: number;
  overspent: boolean;
}

// PMS (собственная платформа бронирования — Путь B / DHP)
export interface PmsRoomOption {
  id: string;
  name: string;
  roomTypes: { id: string; name: string }[];
}
export interface PmsRoom {
  id: string;
  number: string;
  floor: string | null;
  /** Порядок вывода (шахматка/модуль бронирования); меньше — выше. */
  sortOrder: number;
  address: string | null;
  comment: string | null;
  excludeFromStats: boolean;
  sellStatus: 'SELLABLE' | 'NOT_SELLABLE';
  housekeepingStatus: 'CLEAN' | 'DIRTY' | 'INSPECTED' | 'IN_PROGRESS';
  maintenanceStatus: 'OK' | 'OUT_OF_SERVICE' | 'OUT_OF_ORDER';
  lockId: string | null;
  active: boolean;
  /** Секция для распределения уборок (TASKS-HOUSEKEEPING-TZ §7). */
  sectionId?: string | null;
  /** Инструкция по заселению юнита (режим апартаментов, CHECK-IN-TZ). */
  checkinInstructions?: string | null;
  /** Фото-инструкция по заселению (публичные URL), режим апартаментов. */
  checkinPhotos?: string[];
  property: { id: string; name: string };
  roomType: { id: string; name: string; sortOrder?: number };
}

/** Категория номеров (раздел «Номерной фонд», Путь B). */
export interface RoomFundCategory {
  id: string;
  propertyId: string;
  property: { id: string; name: string };
  name: string;
  shortName: string | null;
  typeLabel: string | null;
  capacity: number;
  mainPlaces: number | null;
  extraPlaces: number;
  securityDeposit: number | null;
  roomsInUnit: number | null;
  bedType: string | null;
  bedPreferences: string[];
  bedPreference: string | null;
  viewPreference: string | null;
  areaMode: string;
  areaSqm: number | null;
  areaSqmTo: number | null;
  description: string | null;
  amenities: string[];
  views: string[];
  priorityAmenities: string[];
  photos: string[];
  videos: string[];
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  howToReach: string | null;
  confirmationFileUrl: string | null;
  sortOrder: number;
  showInBooking: boolean;
  showInOta: boolean;
  active: boolean;
  _count: { rooms: number };
}
export interface RoomFundChangeEntry {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  actorName: string | null;
  payload: Record<string, unknown> | null;
  at: string;
}
/** Группа оснащения (удобства) для редактора категории. */
export interface AmenityGroup {
  value: string;
  label: string;
  items: { code: string; label: string; icon?: string | null; isFilter?: boolean }[];
}
export interface UploadResult {
  url: string;
  name: string;
  size: number;
  contentType: string;
}
/** Панель «Заселение» (CHECK-IN-TZ §1/§11): стадия воронки + шлюзы. */
export interface CheckinFunnelGate {
  key: 'contact_verified' | 'registration_approved' | 'payment_paid' | 'room_assigned' | 'time_window_open';
  ok: boolean;
  reason: string | null;
}
export interface CheckinFunnelPanel {
  bookingId: string;
  stage: 'AWAITING' | 'IDENTIFIED' | 'REGISTERED' | 'PAID' | 'READY' | 'KEY_ISSUED' | 'COMPLETED' | 'NO_SHOW' | 'CANCELLED';
  gates: CheckinFunnelGate[];
  window: { start: string; end: string };
  checkinStatus: string;
  paymentStatus: string;
  roomAssigned: boolean;
  roomName: string | null;
  hasContact: boolean;
  keys: { doorName: string | null; status: string; validFrom: string; validUntil: string }[];
}

/** Конструктор воронки заселения (CHECK-IN-TZ §2). */
export interface FunnelStageConfig {
  id: string;
  key: 'identification' | 'registration' | 'payment' | 'key_issue' | 'custom';
  title: string;
  order: number;
  enabled: boolean;
  required: boolean;
  conditions: { type: string; params?: Record<string, unknown> }[];
  channels: string[];
  notificationTemplateKey: string | null;
  reminderPolicy: { offsetHours: number; channels?: string[] }[] | null;
  timing: Record<string, unknown> | null;
  guestDescription: string | null;
  staffNote: string | null;
}
export interface CheckinFunnel {
  id: string;
  scope: 'TENANT' | 'PROPERTY';
  propertyId: string | null;
  name: string;
  description: string | null;
  active: boolean;
  isDefault: boolean;
  stages: FunnelStageConfig[];
}
export interface FunnelDictionary {
  conditions: { type: string; label: string }[];
  channels: { key: string; label: string; active?: boolean }[];
  stageKeys: { key: string; label: string }[];
  protectedStageKeys: string[];
  templates: { key: string; label: string; preview: { title: string; body: string } }[];
}

/** Очередь заезда (CHECK-IN-TZ §11). */
export interface ArrivalQueueItem {
  bookingId: string;
  bookingNumber: string | null;
  guestName: string | null;
  guestPhone: string | null;
  propertyId: string;
  propertyName: string;
  roomNumber: string | null;
  arrivalTime: string | null;
  status: string;
  stage: CheckinFunnelPanel['stage'];
  badGates: { key: string; reason: string | null }[];
  checkinStatus: string;
  paymentStatus: string;
  hasActiveKey: boolean;
  hasLink: boolean;
}
export interface CheckinFunnelReport {
  total: number;
  byStatus: Record<string, number>;
  byStage: Record<string, number>;
  byChannel: Record<string, number>;
  events: Record<string, number>;
  autoCheckins: number;
  escalations: number;
  keyFailures: number;
}

/** Шаблоны уведомлений (CHECK-IN-TZ §5.2). */
export interface NotifTemplateScenario {
  scenario: string;
  label: string;
  vars: string[];
  sample: Record<string, string | number>;
  defaultChannels: string[];
  defaultText: { title: string; body: string };
  overrides: { channel: string; title: string; body: string }[];
}
export type FunnelStagePatch = Partial<Omit<FunnelStageConfig, 'id' | 'order'>> & { force?: boolean };

export interface PmsBooking {
  id: string;
  bookingNumber: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'NO_SHOW' | 'CANCELLED';
  paymentStatus: string;
  channel: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  adults: number | null;
  children: number | null;
  arrivalTime: string | null;
  departureTime: string | null;
  totalPrice: number;
  extrasTotal: number;
  ratePlanId: string;
  ratePlanName: string;
  roomId: string | null;
  roomLocked: boolean;
  comment: string | null;
  cancelReason: string | null;
  bookingMethod: string | null;
  referralSource: string | null;
  discountReason: string | null;
  otaCommission: number | null;
  externalObjectId: string | null;
  sourceName: string | null;
  paymentComment: string | null;
  createdAt: string;
  priceBreakdown: { nights?: { date: string; finalPrice: number }[]; stayAmount?: number; surcharges?: { type: 'early' | 'late'; percent: number; base: number; amount: number }[] } | null;
  property: { id: string; name: string };
  roomType: { id: string; name: string };
  room: { id: string; number: string } | null;
  guest: { id: string; firstName: string | null; lastName: string | null; phone: string | null; email: string | null } | null;
  extras?: BookingExtraLine[];
  tags?: BookingTag[];
}
/** Объект размещения (полная карточка, §12). */
export interface PmsProperty {
  id: string;
  name: string;
  kind: 'HOTEL' | 'APARTMENT' | 'MINI_HOTEL';
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
  checkInTime: string | null;
  /** Автозаезд воронки заселения (CHECK-IN-TZ §6.3). */
  autoCheckin?: boolean;
  /** Режим апартаментов: инструкция по заселению у каждого номера (CHECK-IN-TZ). */
  perRoomInstructions?: boolean;
  checkOutTime: string | null;
  wifiName: string | null;
  wifiPassword: string | null;
  houseRules: string | null;
  instructions: string | null;
  securityDeposit: number | null;
  active: boolean;
  _count?: { roomTypes: number; rooms: number };
}
export type PmsPropertyInput = Partial<Omit<PmsProperty, 'id' | '_count'>>;

/** Цветной тег-маркер брони (шахматка). */
export interface BookingTag {
  id: string;
  name: string;
  color: string; // ключ палитры: red | amber | emerald | blue | violet
  sortOrder?: number;
  active?: boolean;
}
/** Платёжная сводка брони (для выставления оплаты/предоплаты). */
export interface BookingPaymentInfo {
  total: number;
  paid: number;
  remaining: number;
  prepayment: number;
  guarantee: { method?: string; dueTerm?: string; legalEntityId?: string | null } | null;
}
/** Платёж по брони (история во вкладке «Счёт»). */
export interface BookingPayment {
  id: string;
  provider: string;
  status: 'NOT_PAID' | 'PENDING' | 'AUTHORIZED' | 'PAID' | 'PARTIALLY_REFUNDED' | 'REFUNDED' | 'FAILED';
  amount: number;
  refundedAmount: number;
  createdAt: string;
  paidAt: string | null;
  payerType: string | null;
  payerName: string | null;
  settlementKind: string | null;
  vatRate: number | null;
  manual: boolean;
  method: string | null;
}
/** Доступная платёжная система для онлайн-ссылки (вкладка «Счёт»). */
export interface PaymentSystem {
  id: string;
  name: string;
  active: boolean;
  methods: { card: boolean; sbp: boolean };
}
/** Позиция счёта/акта. */
export interface FinanceDocLine {
  name: string;
  qty?: number;
  unit?: string;
  price: number;
  vatRate?: number;
  amount: number;
}
/** Финансовый документ брони: счёт / квитанция / онлайн-оплата / акт. */
export interface FinanceDoc {
  id: string;
  bookingId: string;
  docType: 'INVOICE' | 'RECEIPT' | 'ONLINE' | 'ACT';
  number: string;
  docDate: string;
  buyerType: string;
  buyerName: string | null;
  buyerLegalEntityId: string | null;
  ourLegalEntityId: string | null;
  message: string | null;
  lines: FinanceDocLine[];
  total: number;
  vatTotal: number;
  dueDate: string | null;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
  createdAt: string;
}
/** Залог (обеспечительный платёж) по брони. */
export interface Deposit {
  id: string;
  bookingId: string;
  type: 'CARD_HOLD' | 'MANUAL';
  method: string | null;
  amount: number;
  status: 'HELD' | 'CAPTURED' | 'RELEASED' | 'REFUNDED';
  capturedAmount: number;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
}
/** Запись журнала изменений брони. */
export interface BookingAuditEntry {
  id: string;
  action: string;
  at: string;
  actor: string;
  payload: Record<string, unknown> | null;
}
/** Позиция доп-услуги в брони (снимок цены). */
export interface BookingExtraLine {
  id: string;
  extraId: string | null;
  name: string;
  unit: string;
  unitPrice: number;
  qty: number;
  total: number;
}
/** Вход для добавления доп-услуги к брони. */
export interface BookingExtraInput {
  extraId?: string;
  name?: string;
  unitPrice?: number;
  qty: number;
}
/** Реквизиты организации (Финансы). */
export interface LegalEntity {
  id: string;
  name: string;
  legalName: string | null;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  legalAddress: string | null;
  director: string | null;
  phone: string | null;
  email: string | null;
  bankName: string | null;
  bankAccount: string | null;
  corrAccount: string | null;
  bik: string | null;
  signatureUrl: string | null;
  stampUrl: string | null;
  defaultVatRate: number | null;
  isDefault: boolean;
  active: boolean;
}
export type LegalEntityInput = Partial<Omit<LegalEntity, 'id'>> & { name: string };
/** Контрагент-покупатель (агентство/компания) — справочник для счетов/актов. */
export interface Counterparty {
  id: string;
  name: string;
  kind: 'company' | 'agency';
  legalName: string | null;
  inn: string | null;
  kpp: string | null;
  ogrn: string | null;
  legalAddress: string | null;
  director: string | null;
  phone: string | null;
  email: string | null;
  bankName: string | null;
  bankAccount: string | null;
  corrAccount: string | null;
  bik: string | null;
  commission: number | null;
  note: string | null;
  active: boolean;
}
export type CounterpartyInput = Partial<Omit<Counterparty, 'id'>> & { name: string };
/** Предпросмотр импорта из Bnovo. */
export interface BnovoImportPreview {
  reachable: boolean;
  error?: string;
  bnovo: { properties: number; roomTypes: number; rooms: number; sampleRoomTypes: { name: string; capacity: number }[]; sampleRooms: { number: string; floor?: string }[] };
  existing: { id: string; name: string; property: string; rooms: number; bookings: number; fromBnovo: boolean }[];
}
/** Реквизиты подключения Bnovo (без ключа). */
export interface BnovoConfig {
  accountId: number | null;
  apiKeySet: boolean;
  connected: boolean;
}
/** Результат импорта из Bnovo. */
export interface BnovoImportResult {
  properties: number;
  roomTypes: number;
  rooms: number;
  deletedCategories: number;
  deletedBookings: number;
  hiddenCategories: number;
  keptCategories: { name: string; bookings: number }[];
}
/** Платёжная/учётная интеграция (Финансы). */
export interface FinanceIntegration {
  id: string;
  name: string;
  description: string;
  category: 'online' | 'fiscal' | 'accounting';
  connected: boolean;
  enabled: boolean;
  available: boolean;
  /** Активный эквайер — платежи идут через него (только для online). */
  active?: boolean;
}
export interface FinanceAuditEntry {
  id: string;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  payload: Record<string, unknown> | null;
  at: string;
}
/** Способы оплаты эквайринга (карты / СБП). */
export interface PaymentMethodsConfig {
  card: boolean;
  sbp: boolean;
}
/** Конфигурация эквайринга БСПБ (подключение + способы оплаты), без пароля. */
export interface BspbAdminConfig {
  apiBase: string;
  merchantId: string;
  username: string;
  passwordSet: boolean;
  connected: boolean;
  methods: PaymentMethodsConfig;
}
/** Вход сохранения конфигурации БСПБ (пароль опционален: пусто — не менять). */
export interface SaveBspbConfigInput {
  apiBase?: string;
  merchantId?: string;
  username?: string;
  password?: string;
  card: boolean;
  sbp: boolean;
}
/** Конфигурация PayKeeper (подключение + способы оплаты), без секретов. */
export interface PaykeeperAdminConfig {
  server: string;
  user: string;
  passwordSet: boolean;
  secretSet: boolean;
  connected: boolean;
  methods: PaymentMethodsConfig;
}
/** Вход сохранения конфигурации PayKeeper (пароль/секрет: пусто — не менять). */
export interface SavePaykeeperConfigInput {
  server?: string;
  user?: string;
  password?: string;
  secret?: string;
  card: boolean;
  sbp: boolean;
}
/** Конфигурация ЮKassa (подключение + способы оплаты), без секретов. */
export interface YookassaAdminConfig {
  shopId: string;
  secretKeySet: boolean;
  connected: boolean;
  methods: PaymentMethodsConfig;
}
/** Вход сохранения конфигурации ЮKassa (секретный ключ: пусто — не менять). */
export interface SaveYookassaConfigInput {
  shopId?: string;
  secretKey?: string;
  card: boolean;
  sbp: boolean;
}
/** Статус фискализации чеков (54-ФЗ). */
export interface FiscalStatus {
  provider: string;
  enabled: boolean;
}
export interface PmsQuote {
  ratePlanId: string;
  ratePlanName: string;
  nightsCount: number;
  nights: { date: string; finalPrice: number }[];
  stayAmount: number;
  totalAmount: number;
  currency: string;
}
export interface PmsAvailabilityRow {
  roomTypeId: string;
  roomTypeName: string;
  propertyId: string;
  propertyName: string;
  capacity: number;
  totalRooms: number;
  available: number;
  nights: number;
}
export interface PmsRoomBlock {
  id: string;
  roomId: string;
  propertyId: string;
  type: string;
  from: string;
  to: string;
  reason: string | null;
  active: boolean;
  room?: { id: string; number: string };
}
export interface PmsRatePlan {
  id: string;
  name: string;
  code: string;
  kind: string;
  propertyId: string | null;
  refundable: boolean;
  active: boolean;
  availableFrontDesk: boolean;
  availableBookingModule: boolean;
  availableOta: boolean;
  parentRatePlanId: string | null;
  adjustmentType: 'PERCENT' | 'FIXED' | null;
  adjustmentValue: number | null;
  description?: string | null;
  priceMode?: string | null;
  priceRounding?: string | null;
  restrictionMode?: string | null;
  defaultRestriction?: string | null;
  meals?: RateMeal[] | null;
  includedServices?: RateIncludedService[] | null;
  earlyLateMode?: string | null;
  earlyLateApplyMain?: boolean;
  freeCancelDays?: number | null;
  cancellationComment?: string | null;
  rulePeriods?: RateRulePeriod[] | null;
  guaranteeType?: string | null;
  releaseOpenDays?: number | null;
  releaseOpenHours?: number | null;
  releaseCloseDays?: number | null;
  releaseCloseHours?: number | null;
  defaultMinNights?: number | null;
  restrictionCategoryIds?: string[] | null;
  earlyLateConfig?: EarlyLateConfig | null;
  guaranteeConfig?: GuaranteeConfig | null;
}
export interface EarlyLateEntry { percent: number; base: string }
export interface EarlyLateConfig { early?: EarlyLateEntry; late?: EarlyLateEntry }
export interface GuaranteeAudience {
  method?: string; stayPrepay?: number; extrasPrepay?: boolean; dueTerm?: string;
  autoCancel?: boolean; payKeeper?: boolean; yookassa?: boolean; buyers?: string; showForOnline?: boolean; description?: string;
  /** Единица размера предоплаты: рубли или процент. */
  stayPrepayUnit?: 'RUB' | 'PERCENT';
  /** База для процента: от полной стоимости брони или от первой ночи. */
  stayPrepayBase?: 'FULL' | 'FIRST_NIGHT';
  /** Реквизиты (LegalEntity.id) для счёта. null/'' — по умолчанию. */
  legalEntityId?: string | null;
  /** Список конкретных компаний/агентств (когда buyers='specific'), по строке на запись. */
  buyersList?: string;
  /** Комиссия агентства, % (для аудитории «Агентства»). */
  agencyCommission?: number;
}
export interface GuaranteeConfig { type?: string; individual?: GuaranteeAudience; company?: GuaranteeAudience; agency?: GuaranteeAudience }
export interface RateMeal { type: string; price: number }
export interface RateIncludedService { extraId: string; note?: string }
export interface RateRulePeriod { from: string; to: string; freeCancelDays?: number }
/** Полная конфигурация тарифа (форма создания/редактирования, эталон Bnovo). */
export interface RatePlanConfigInput {
  kind?: string;
  description?: string;
  refundable?: boolean;
  active?: boolean;
  availableFrontDesk?: boolean;
  availableBookingModule?: boolean;
  availableOta?: boolean;
  parentRatePlanId?: string;
  adjustmentType?: string;
  adjustmentValue?: number;
  priceMode?: string;
  priceRounding?: string;
  restrictionMode?: string;
  defaultRestriction?: string;
  meals?: RateMeal[];
  includedServices?: RateIncludedService[];
  earlyLateMode?: string;
  earlyLateApplyMain?: boolean;
  freeCancelDays?: number;
  cancellationComment?: string;
  rulePeriods?: RateRulePeriod[];
  guaranteeType?: string;
  releaseOpenDays?: number;
  releaseOpenHours?: number;
  releaseCloseDays?: number;
  releaseCloseHours?: number;
  defaultMinNights?: number;
  restrictionCategoryIds?: string[];
  earlyLateConfig?: EarlyLateConfig;
  guaranteeConfig?: GuaranteeConfig;
}
export interface PmsRateCalendarCell {
  date: string;
  price: number | null;
  minStay: number | null;
  minStayArrival: number | null;
  maxStay: number | null;
  stopSell: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
}
export type RestrictionStatus = 'open' | 'closed' | 'restricted';
export interface RestrictionGrid {
  dates: string[];
  rows: { id: string; name: string; cells: RestrictionStatus[] }[];
}
export interface Channel {
  id: string;
  code: string;
  name: string;
  kind: string;
  status: string;
  active: boolean;
  lastSyncAt: string | null;
  lastBookingAt: string | null;
}
export interface ChannelMonitoring extends Channel {
  provider: string;
  jobs: { pending: number; processing: number; success: number; failed: number; retryScheduled: number; deadLetter: number };
  lastBooking: { externalBookingId: string; status: string; createdAt: string } | null;
  recentLogs: ChannelSyncLog[];
}
export interface AvitoListing {
  id: number;
  title?: string;
  address?: string;
  price?: number;
  status?: string;
  url?: string;
  mappedRoomTypeId: string | null;
}
export interface AvitoPollResult {
  channelId: string;
  items: number;
  fetched: number;
  ingested: number;
  cancelled: number;
  conflicts: number;
  duplicates: number;
  errors: number;
}
export interface ChannelMapping {
  property: { id: string; propertyId: string; remotePropertyId: string }[];
  roomType: { id: string; roomTypeId: string; remoteRoomTypeId: string }[];
  ratePlan: { id: string; ratePlanId: string; remoteRatePlanId: string }[];
}
export interface ChannelSyncJob {
  id: string;
  jobType: string;
  status: string;
  propertyId: string | null;
  errorCode: string | null;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface ChannelSyncLog {
  id: string;
  operation: string;
  status: string;
  message: string | null;
  createdAt: string;
}
// --- Задачи и Уборка (TASKS-HOUSEKEEPING-TZ) ---
export type OpsKind = 'TASK' | 'CLEANING';
export type OpsStatus = 'PLAN' | 'NEW' | 'ACCEPTED' | 'IN_PROGRESS' | 'PAUSED' | 'WAITING_CONFIRM' | 'DONE' | 'CANCELLED';

export interface OpsSnapshotItem {
  id: string;
  parentId: string | null;
  order: number;
  kind: 'HEADER' | 'ITEM' | 'SUBITEM';
  text: string;
  thirdOption: string | null;
  requirePhoto: boolean;
  excludeFromScore: boolean;
}
export interface OpsChecklistAnswer {
  id: string;
  itemId: string;
  answer: string;
  comment: string | null;
  photoUrl: string | null;
}
export interface OpsTaskChecklist {
  id: string;
  name: string;
  requiredBeforeStart: boolean;
  itemsSnapshot: OpsSnapshotItem[];
  answers: OpsChecklistAnswer[];
}
export interface OpsTag {
  id: string;
  name: string;
  color: string;
  comment: string | null;
  archivedAt: string | null;
}
export interface OpsTask {
  id: string;
  kind: OpsKind;
  status: OpsStatus;
  title: string;
  description: string | null;
  propertyId: string;
  roomId: string | null;
  zoneId: string | null;
  bookingId: string | null;
  cleaningTypeId: string | null;
  important: boolean;
  severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
  blocksSale: boolean;
  dueAt: string | null;
  acceptBy: string | null;
  scheduledAt: string | null;
  planDate: string | null;
  planOrder: number | null;
  supervisorId: string | null;
  requirePhotoResult: boolean;
  requireConfirmation: boolean;
  guestRequest: boolean;
  pmRuleId: string | null;
  createdBy: string | null;
  workSeconds: number;
  lastActivityAt: string;
  unread?: number;
  createdAt: string;
  completedAt: string | null;
  room?: { id: string; number: string; floor: string | null; roomTypeId: string; sectionId?: string | null; dndUntil: string | null; cleanRequestedAt: string | null } | null;
  zone?: { id: string; name: string } | null;
  group?: { id: string; name: string; color: string } | null;
  assignees: { userId: string }[];
  watchers: { userId: string }[];
  tags: { tagId: string; tag: OpsTag }[];
  checklists: OpsTaskChecklist[];
  _count?: { comments: number; attachments: number };
  standardMinutes?: number;
}
export interface OpsTaskFull extends OpsTask {
  comments: { id: string; authorId: string | null; body: string; createdAt: string }[];
  attachments: { id: string; fileUrl: string; name: string | null; createdAt: string }[];
  statusLog: { id: string; from: OpsStatus; to: OpsStatus; actorId: string | null; note: string | null; at: string }[];
  /** Гость текущей/ближайшей брони номера (только с правом ops_guest_info). */
  guestInfo?: { name: string; phone: string | null; checkIn: string; checkOut: string; status: string } | null;
}
export interface OpsTimelineDay {
  date: string;
  created: number;
  done: number;
  avgReactionSeconds: number | null;
  avgWorkSeconds: number | null;
}
export interface OpsStaff {
  id: string;
  name: string | null;
  email: string;
  roleKey: string | null;
  onDuty: boolean;
  avatarUrl: string | null;
}
export interface OpsGroup {
  id: string;
  name: string;
  color: string;
  headUserId: string | null;
  parentId: string | null;
  members: { adminUserId: string }[];
}
export interface CleaningType {
  id: string;
  name: string;
  forResidential: boolean;
  color: string;
  checklistId: string | null;
  checklistBeforeStart: boolean;
  presetKey: string | null;
}
export interface CleaningStandard {
  id: string;
  cleaningTypeId: string;
  roomTypeId: string | null;
  minutes: number;
}
export interface CleaningRule {
  id: string;
  propertyId: string | null;
  cleaningTypeId: string;
  condition: 'TODAY_CHECKOUT' | 'TODAY_CHECKIN' | 'BACK_TO_BACK' | 'VACANT' | 'OCCUPIED';
  roomTypeId: string | null;
  minStayNights: number | null;
  ratePlanId: string | null;
  promoCode: string | null;
  enabled: boolean;
}
export interface OpsChecklistAnalytics {
  checklistId: string;
  name: string;
  runs: number;
  avgScore: number;
  totalErrors: number;
  history: { date: string; taskId: string; taskTitle: string; room: string; assignee: string; score: number; errors: number }[];
}
export interface OpsProReport {
  hours: { hour: number; total: number; templated: number }[];
  templates: { name: string; kind: 'template' | 'recurring'; count: number; done: number; avgWorkSeconds: number | null; rooms: number }[];
}
export interface OpsChecklist {
  id: string;
  name: string;
  items: OpsSnapshotItem[] & { checklistId?: string }[];
}
export interface OpsTemplate {
  id: string;
  name: string;
  payload: Record<string, unknown>;
}
export interface OpsRecurring {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'INTERVAL';
  time: string;
  days: number[];
  intervalDays: number | null;
  startDate: string | null;
  enabled: boolean;
  lastFiredAt: string | null;
}
export interface OpsAutomation {
  id: string;
  type: 'REMIND' | 'ESCALATE';
  name: string;
  status: OpsStatus;
  afterMinutes: number;
  repeatMinutes: number | null;
  targetRoleKey: string | null;
  severity: 'MINOR' | 'MAJOR' | 'CRITICAL' | null;
  tagId: string | null;
  guestOnly: boolean;
  notifyTarget: 'USER' | 'GROUP_HEAD' | 'SUPERVISOR' | 'CREATOR';
  escalateToUserId: string | null;
  enabled: boolean;
}
/** SLA-политика (LQA): нормативы по критичности × источнику заявки. */
export interface OpsSlaPolicy {
  id: string;
  severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
  guestRequest: boolean;
  acceptMinutes: number | null;
  dueMinutes: number | null;
  enabled: boolean;
}
/** ППР-цикл (LQA): профилактический обход номерного фонда. */
export interface OpsPmRule {
  id: string;
  name: string;
  propertyId: string | null;
  roomTypeId: string | null;
  periodDays: number;
  perDay: number;
  checklistId: string | null;
  groupId: string | null;
  tagIds: string[];
  enabled: boolean;
  lastRunAt: string | null;
  stats: { totalRooms: number; open: number; doneInCycle: number; dueRooms: number; neverDone: number; daysToClear: number | null };
}
/** Повторные заявки (LQA): тот же номер + тег ≥2 раз за период. */
export interface OpsRepeatRow {
  roomId: string;
  room: string;
  label: string;
  count: number;
  items: { id: string; title: string; status: OpsStatus; createdAt: string }[];
}
export interface OpsZone {
  id: string;
  propertyId: string;
  name: string;
  floor: string | null;
  sectionId: string | null;
}
export interface OpsWriteoffList {
  id: string;
  name: string;
  cleaningTypeId: string | null;
  roomTypeId: string | null;
  items: { itemId: string; qty: number }[];
}
export interface OpsSection {
  id: string;
  propertyId: string;
  name: string;
}
export interface OpsPlan {
  date: string;
  tasks: OpsTask[];
  users: { id: string; name: string | null; email: string; roleKey: string | null }[];
  types: CleaningType[];
}
export interface OpsDashboard {
  tasks: { kind: OpsKind; status: OpsStatus; count: number }[];
  rooms: { status: string; count: number }[];
  overdue: number;
  outOfOrder: number;
  dnd: number;
}
export interface OpsTasksReport {
  days: { date: string; created: number; done: number; cancelled: number }[];
  avgReactionSeconds: number | null;
  avgWorkSeconds: number | null;
  total: number;
}
export interface OpsCleaningRow {
  id: string;
  date: string;
  room: string;
  type: string;
  assignee: string;
  status: OpsStatus;
  statusRu: string;
  standardMinutes: number | null;
  factMinutes: number | null;
  exceeded: boolean;
  errors: number;
}

// --- AI · Контроль качества чатов (§5.7) ---
export type QaSentiment = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';

export interface QaDashboard {
  periodDays: number;
  reviewed: number;
  avgOverallScore: number | null;
  avgFirstResponseSec: number | null;
  avgTimeToPickupSec: number | null;
  avgResponseSec: number | null;
  avgResolutionSec: number | null;
  slaRate: number | null;
  sentiment: Record<QaSentiment, number>;
  topFlags: { flag: string; count: number }[];
  byOperator: {
    operatorId: string;
    operatorName: string | null;
    reviews: number;
    avgOverallScore: number | null;
    avgFirstResponseSec: number | null;
  }[];
  conversations: { total: number; byStatus: Record<string, number>; escalationRate: number | null };
}

export interface QaReviewRow {
  id: string;
  conversationId: string;
  operatorId: string | null;
  operatorName: string | null;
  timeToPickupSec: number | null;
  firstResponseSec: number | null;
  avgResponseSec: number | null;
  maxResponseSec: number | null;
  resolutionSec: number | null;
  guestMsgCount: number;
  staffMsgCount: number;
  withinSla: boolean | null;
  overallScore: number | null;
  criteria: Record<string, number> | null;
  flags: string[] | null;
  sentiment: QaSentiment | null;
  summary: string | null;
  model: string | null;
  createdAt: string;
}

// --- AI · Лента эскалаций (operator inbox §4.7) ---
export interface InboxConversationRow {
  id: string;
  channel: string;
  guestId: string | null;
  guestName: string | null;
  operatorId: string | null;
  operatorName: string | null;
  externalId: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface InboxThreadMessage {
  role: 'user' | 'ai' | 'staff' | 'system';
  text: string;
  createdAt: string;
}
/** Строка списка «все гостевые диалоги» (мониторинг): базовые поля + статус и превью. */
export interface GuestConversationRow extends InboxConversationRow {
  status?: string;
  lastRole?: 'user' | 'ai' | 'staff' | null;
  lastMessage?: string | null;
  lastAt?: string;
}
export interface InboxOperator {
  id: string;
  name: string;
  role: string;
}
export interface InboxThread {
  conversation: {
    id: string;
    channel: string;
    status: string;
    guestId: string | null;
    guestName: string | null;
    operatorId: string | null;
    operatorName: string | null;
    createdAt: string;
  };
  messages: InboxThreadMessage[];
}
export interface CopilotPendingAction {
  toolCallId: string;
  name: string;
  args: Record<string, unknown>;
}
export interface CopilotResult {
  conversationId: string;
  reply: string;
  pending: CopilotPendingAction[];
}
export interface CopilotDecision {
  toolCallId: string;
  allow: boolean;
  denyReason?: string;
}

// --- Мессенджер сотрудников (§2) ---
export type StaffChatKind = 'DM' | 'GROUP';
export interface StaffChatListItem {
  id: string;
  kind: StaffChatKind;
  title: string | null;
  online: boolean;
  otherUserId: string | null;
  memberCount: number;
  unread: number;
  notifyMode: 'ALL' | 'MENTIONS' | 'NONE';
  muted: boolean;
  lastMessage: { text: string; senderId: string; createdAt: string } | null;
  updatedAt: string;
}
export interface StaffColleague {
  id: string;
  name: string;
  online: boolean;
}
export interface StaffDepartment {
  id: string;
  name: string;
  color: string;
  memberIds: string[];
}
export interface StaffGlobalSearchResult {
  id: string;
  chatId: string;
  chatTitle: string;
  senderId: string;
  text: string;
  createdAt: string;
}
export interface StaffChatMediaItem {
  id: string;
  kind: string;
  url: string;
  name: string;
  size: number;
  mime: string;
  createdAt: string;
}
export interface StaffChatMedia {
  images: StaffChatMediaItem[];
  videos: StaffChatMediaItem[];
  files: StaffChatMediaItem[];
  links: { messageId: string; url: string; senderId: string; createdAt: string }[];
}
export interface StaffMember {
  id: string;
  name: string;
  avatarUrl?: string | null;
  online?: boolean;
}
export interface StaffMessageReaction {
  emoji: string;
  count: number;
  mine: boolean;
}
export interface StaffMessageReply {
  id: string;
  senderId: string;
  text: string;
}
export interface StaffAttachment {
  id: string;
  kind: 'IMAGE' | 'VIDEO' | 'VOICE' | 'FILE';
  url: string;
  name: string;
  size: number;
  mime: string;
}
export interface StaffMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
  edited: boolean;
  deleted: boolean;
  pinned: boolean;
  saved: boolean;
  read: boolean;
  replyTo: StaffMessageReply | null;
  reactions: StaffMessageReaction[];
  attachments: StaffAttachment[];
  mentions: { id: string; name: string }[];
  mentionsMe: boolean;
}
export interface StaffMessagesResponse {
  messages: StaffMessage[];
  typingUserIds: string[];
}
export interface StaffSearchResult {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
}
export type StaffPin = StaffSearchResult;
export interface StaffFolder {
  id: string;
  name: string;
  order: number;
  chatIds: string[];
}
export interface StaffSavedMessageItem {
  id: string;
  chatId: string;
  senderId: string;
  text: string;
  createdAt: string;
}

export const adminApi = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; role: string }>('/admin/auth/login', {
      method: 'POST',
      body: { email, password },
    }),
  me: () => request<AdminMe>('/admin/auth/me'),

  // Роли и доступы
  permissionsCatalog: () => request<PermissionDef[]>('/admin/permissions'),
  roles: () => request<Role[]>('/admin/roles'),
  createRole: (body: { name: string; permissions?: string[] }) =>
    request<Role>('/admin/roles', { method: 'POST', body }),
  updateRole: (key: string, body: { name?: string; permissions?: string[] }) =>
    request<Role>(`/admin/roles/${key}`, { method: 'PATCH', body }),
  deleteRole: (key: string) => request<{ ok: boolean }>(`/admin/roles/${key}`, { method: 'DELETE' }),
  adminUsers: () => request<AdminUserRow[]>('/admin/users'),
  createAdminUser: (body: { email: string; password: string; name?: string; roleKey?: string; positionId?: string; groupIds?: string[]; allowedAddressIds?: string[] }) =>
    request<AdminUserRow>('/admin/users', { method: 'POST', body }),
  updateAdminUser: (id: string, body: { roleKey?: string; positionId?: string; groupIds?: string[]; allowedAddressIds?: string[]; active?: boolean; password?: string; name?: string; phone?: string; birthday?: string | null; hireDate?: string | null; hobby?: string; about?: string; customFields?: Record<string, string> }) =>
    request<AdminUserRow>(`/admin/users/${id}`, { method: 'PATCH', body }),
  // Карточка сотрудника (§6)
  adminUserCard: (id: string) => request<EmployeeCard>(`/admin/users/${id}/card`),
  adminUploadUserPhoto: (id: string, file: File) => upload<{ avatarUrl: string }>(`/admin/users/${id}/photo`, file),
  employeeFields: () => request<EmployeeFieldDef[]>('/admin/employee-fields'),
  createEmployeeField: (body: { name: string; editableBy?: string }) => request<EmployeeFieldDef>('/admin/employee-fields', { method: 'POST', body }),
  updateEmployeeField: (id: string, body: { name?: string; editableBy?: string }) => request<EmployeeFieldDef>(`/admin/employee-fields/${id}`, { method: 'PATCH', body }),
  deleteEmployeeField: (id: string) => request<{ ok: boolean }>(`/admin/employee-fields/${id}`, { method: 'DELETE' }),
  // Моя карточка (self-service)
  myProfile: () => request<EmployeeCard>('/admin/profile'),
  updateMyProfile: (body: { phone?: string; birthday?: string | null; hobby?: string; about?: string; customFields?: Record<string, string> }) => request<EmployeeCard>('/admin/profile', { method: 'PATCH', body }),
  uploadMyPhoto: (file: File) => upload<{ avatarUrl: string }>('/admin/profile/photo', file),
  // Публичный профиль коллеги (карточка из мессенджера)
  staffUserProfile: (id: string) => request<StaffPublicProfile>(`/admin/profile/user/${id}`),
  positions: () => request<Position[]>('/admin/positions'),
  createPosition: (body: { name: string; defaultRoleKey?: string }) => request<Position>('/admin/positions', { method: 'POST', body }),
  updatePosition: (id: string, body: { name?: string; defaultRoleKey?: string | null }) => request<Position>(`/admin/positions/${id}`, { method: 'PATCH', body }),
  deletePosition: (id: string) => request<{ ok: boolean }>(`/admin/positions/${id}`, { method: 'DELETE' }),

  // PMS · Номерной фонд (Путь B)
  pmsRoomOptions: () => request<PmsRoomOption[]>('/v1/rooms/options'),
  pmsRooms: (params: { propertyId?: string; roomTypeId?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.propertyId) qs.set('propertyId', params.propertyId);
    if (params.roomTypeId) qs.set('roomTypeId', params.roomTypeId);
    const q = qs.toString();
    return request<PmsRoom[]>(`/v1/rooms${q ? `?${q}` : ''}`);
  },
  pmsCreateRoom: (body: { propertyId: string; roomTypeId: string; number: string; floor?: string; address?: string; comment?: string; excludeFromStats?: boolean }) =>
    request<PmsRoom>('/v1/rooms', { method: 'POST', body }),
  pmsUpdateRoom: (id: string, body: { number?: string; floor?: string; address?: string; roomTypeId?: string; comment?: string; excludeFromStats?: boolean; active?: boolean; sectionId?: string; checkinInstructions?: string; checkinPhotos?: string[] }) =>
    request<PmsRoom>(`/v1/rooms/${id}`, { method: 'PATCH', body }),
  pmsRoomStatus: (id: string, body: { housekeepingStatus?: string; maintenanceStatus?: string; sellStatus?: string }) =>
    request<PmsRoom>(`/v1/rooms/${id}/status`, { method: 'POST', body }),
  pmsDeleteRoom: (id: string) => request<{ ok: boolean }>(`/v1/rooms/${id}`, { method: 'DELETE' }),
  pmsBulkRooms: (body: { propertyId: string; roomTypeId: string; from: string; to: string; floor?: string; comment?: string; excludeFromStats?: boolean }) =>
    request<{ created: number; skipped: string[]; numbers: string[] }>('/v1/rooms/bulk', { method: 'POST', body }),
  pmsBatchRooms: (body: { propertyId: string; rooms: { number: string; roomTypeId: string; floor?: string; comment?: string; excludeFromStats?: boolean }[] }) =>
    request<{ created: number; skipped: string[]; numbers: string[] }>('/v1/rooms/batch', { method: 'POST', body }),
  pmsBulkInstructions: (body: { items: { roomId: string; address?: string; checkinInstructions?: string }[] }) =>
    request<{ updated: number; skipped: string[] }>('/v1/rooms/instructions', { method: 'POST', body }),

  // PMS · Номерной фонд — категории (Путь B)
  roomFundCategories: (propertyId?: string) =>
    request<RoomFundCategory[]>(`/v1/room-types${propertyId ? `?propertyId=${propertyId}` : ''}`),
  roomFundCategory: (id: string) => request<RoomFundCategory>(`/v1/room-types/${id}`),
  createRoomFundCategory: (body: Partial<RoomFundCategory> & { propertyId: string; name: string }) =>
    request<RoomFundCategory>('/v1/room-types', { method: 'POST', body }),
  updateRoomFundCategory: (id: string, body: Partial<RoomFundCategory>) =>
    request<RoomFundCategory>(`/v1/room-types/${id}`, { method: 'PATCH', body }),
  roomFundVisibility: (id: string, body: { showInBooking?: boolean; showInOta?: boolean }) =>
    request<RoomFundCategory>(`/v1/room-types/${id}/visibility`, { method: 'PATCH', body }),
  duplicateRoomFundCategory: (id: string) => request<RoomFundCategory>(`/v1/room-types/${id}/duplicate`, { method: 'POST' }),
  deleteRoomFundCategory: (id: string) => request<{ ok: boolean }>(`/v1/room-types/${id}`, { method: 'DELETE' }),
  reorderRoomFundCategories: (body: { propertyId: string; orderedIds: string[] }) =>
    request<{ ok: boolean }>('/v1/room-types/reorder', { method: 'PATCH', body }),
  pmsReorderRooms: (ids: string[]) =>
    request<{ ok: boolean; count: number }>('/v1/rooms/reorder', { method: 'POST', body: { ids } }),
  roomFundChangelog: (params: { entity?: string; action?: string; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.entity) qs.set('entity', params.entity);
    if (params.action) qs.set('action', params.action);
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    const q = qs.toString();
    return request<RoomFundChangeEntry[]>(`/v1/room-types/changelog${q ? `?${q}` : ''}`);
  },
  roomFundAmenities: () => request<AmenityGroup[]>('/v1/room-types/amenities'),
  uploadImage: (file: File) => upload<UploadResult>('/v1/uploads/image', file),
  uploadDocument: (file: File) => upload<UploadResult>('/v1/uploads/document', file),
  uploadVideo: (file: File) => upload<UploadResult>('/v1/uploads/video', file),

  // PMS · Бронирования (Путь B)
  pmsBookings: (params: { status?: string; propertyId?: string; from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.propertyId) qs.set('propertyId', params.propertyId);
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    const q = qs.toString();
    return request<PmsBooking[]>(`/v1/bookings${q ? `?${q}` : ''}`);
  },
  pmsBooking: (id: string) => request<PmsBooking>(`/v1/bookings/${id}`),
  // Воронка заселения (CHECK-IN-TZ): панель «Заселение» в окне брони
  pmsCheckinPanel: (bookingId: string) => request<CheckinFunnelPanel>(`/admin/checkin/${bookingId}/panel`),
  pmsCheckinLink: (bookingId: string) => request<{ token: string; url: string }>(`/admin/checkin/${bookingId}/link`, { method: 'POST' }),
  // Очередь заезда + отчёт воронки (CHECK-IN-TZ §11, право checkin_desk)
  checkinQueue: (date?: string, propertyId?: string) => {
    const qs = new URLSearchParams();
    if (date) qs.set('date', date);
    if (propertyId) qs.set('propertyId', propertyId);
    const q = qs.toString();
    return request<ArrivalQueueItem[]>(`/admin/checkin/queue${q ? `?${q}` : ''}`);
  },
  checkinReport: (from: string, to: string) =>
    request<CheckinFunnelReport>(`/admin/checkin/report?from=${from}&to=${to}`),
  // Конструктор воронки заселения (CHECK-IN-TZ §2)
  funnelDictionary: () => request<FunnelDictionary>('/admin/checkin-funnels/dictionary'),
  funnels: () => request<CheckinFunnel[]>('/admin/checkin-funnels'),
  createFunnel: (body: { name: string; description?: string; propertyId?: string }) =>
    request<CheckinFunnel>('/admin/checkin-funnels', { method: 'POST', body }),
  updateFunnel: (id: string, body: { name: string; description?: string; active?: boolean; propertyId?: string }) =>
    request<CheckinFunnel>(`/admin/checkin-funnels/${id}`, { method: 'PATCH', body }),
  deleteFunnel: (id: string) => request<{ ok: true }>(`/admin/checkin-funnels/${id}`, { method: 'DELETE' }),
  createFunnelStage: (funnelId: string, body: FunnelStagePatch & { key: string; title: string; order?: number }) =>
    request<CheckinFunnel>(`/admin/checkin-funnels/${funnelId}/stages`, { method: 'POST', body }),
  updateFunnelStage: (funnelId: string, stageId: string, body: FunnelStagePatch) =>
    request<CheckinFunnel>(`/admin/checkin-funnels/${funnelId}/stages/${stageId}`, { method: 'PATCH', body }),
  deleteFunnelStage: (funnelId: string, stageId: string) =>
    request<CheckinFunnel>(`/admin/checkin-funnels/${funnelId}/stages/${stageId}`, { method: 'DELETE' }),
  reorderFunnelStages: (funnelId: string, stageIds: string[]) =>
    request<CheckinFunnel>(`/admin/checkin-funnels/${funnelId}/stages/reorder`, { method: 'POST', body: { stageIds } }),
  // Шаблоны уведомлений (CHECK-IN-TZ §5.2)
  notifTemplates: () => request<NotifTemplateScenario[]>('/admin/notification-templates'),
  saveNotifTemplate: (scenario: string, body: { channel: string; title: string; body: string }) =>
    request<unknown>(`/admin/notification-templates/${scenario}`, { method: 'PUT', body }),
  resetNotifTemplate: (scenario: string, channel: string) =>
    request<{ ok: true }>(`/admin/notification-templates/${scenario}/${encodeURIComponent(channel)}`, { method: 'DELETE' }),
  pmsCreateBooking: (
    body: {
      propertyId: string; roomTypeId: string; roomId?: string; checkIn: string; checkOut: string;
      guests: number; adults?: number; children?: number; arrivalTime?: string; departureTime?: string;
      totalPrice?: number; ratePlanId?: string; source?: string;
      guestId?: string; firstName?: string; lastName?: string; phone?: string; email?: string;
      bookingMethod?: string; referralSource?: string; discountReason?: string;
      extraIds?: string[]; extras?: BookingExtraInput[]; comment?: string;
    },
    idempotencyKey: string,
  ) => request<PmsBooking>('/v1/bookings', { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } }),
  pmsUpdateBooking: (id: string, body: { checkIn?: string; checkOut?: string; propertyId?: string; roomTypeId?: string; ratePlanId?: string; roomId?: string; arrivalTime?: string; departureTime?: string; guests?: number; totalPrice?: number; comment?: string; bookingMethod?: string; referralSource?: string; discountReason?: string; status?: 'PENDING' | 'CONFIRMED'; roomLocked?: boolean }) =>
    request<PmsBooking>(`/v1/bookings/${id}`, { method: 'PATCH', body }),
  // PMS · Объекты размещения (§12)
  pmsProperties: () => request<PmsProperty[]>('/v1/properties'),
  pmsProperty: (id: string) => request<PmsProperty>(`/v1/properties/${id}`),
  pmsCreateProperty: (body: PmsPropertyInput) => request<PmsProperty>('/v1/properties', { method: 'POST', body }),
  pmsUpdateProperty: (id: string, body: PmsPropertyInput) => request<PmsProperty>(`/v1/properties/${id}`, { method: 'PATCH', body }),
  pmsDeleteProperty: (id: string) => request<{ ok: true }>(`/v1/properties/${id}`, { method: 'DELETE' }),
  // PMS · Теги броней (цветные маркеры шахматки)
  pmsTagPalette: () => request<Record<string, string>>('/v1/tags/palette'),
  pmsTags: () => request<BookingTag[]>('/v1/tags'),
  pmsCreateTag: (body: { name: string; color?: string }) => request<BookingTag>('/v1/tags', { method: 'POST', body }),
  pmsUpdateTag: (id: string, body: { name?: string; color?: string; active?: boolean; sortOrder?: number }) => request<BookingTag>(`/v1/tags/${id}`, { method: 'PATCH', body }),
  pmsDeleteTag: (id: string) => request<{ ok: boolean }>(`/v1/tags/${id}`, { method: 'DELETE' }),
  pmsSetBookingTags: (bookingId: string, tagIds: string[]) => request<BookingTag[]>(`/v1/tags/booking/${bookingId}`, { method: 'PATCH', body: { tagIds } }),
  pmsAddBookingExtra: (id: string, body: BookingExtraInput) => request<PmsBooking>(`/v1/bookings/${id}/extras`, { method: 'POST', body }),
  pmsRemoveBookingExtra: (id: string, lineId: string) => request<PmsBooking>(`/v1/bookings/${id}/extras/${lineId}`, { method: 'DELETE' }),
  pmsRevertCheckIn: (id: string) => request<PmsBooking>(`/v1/bookings/${id}/revert-check-in`, { method: 'POST' }),
  pmsReopenBooking: (id: string) => request<PmsBooking>(`/v1/bookings/${id}/reopen`, { method: 'POST' }),
  pmsBookingPaymentInfo: (id: string) => request<BookingPaymentInfo>(`/v1/bookings/${id}/payment-info`),
  pmsBookingPaymentLink: (id: string, body: { kind?: 'prepayment' | 'full'; amount?: number; system?: string }) =>
    request<{ paymentId?: string; confirmationUrl?: string | null; amount?: number; error?: string; system?: string }>(`/v1/bookings/${id}/payment-link`, { method: 'POST', body }),
  pmsBookingPayments: (id: string) => request<BookingPayment[]>(`/v1/bookings/${id}/payments`),
  pmsRecordManualPayment: (id: string, body: { amount: number; method: 'cash' | 'card' | 'transfer' | 'other'; payerType?: 'individual' | 'legal'; payerName?: string; settlementKind?: string; vatRate?: number; paidAt?: string }) =>
    request<{ paymentId: string; paid: number; remaining: number }>(`/v1/bookings/${id}/payments/manual`, { method: 'POST', body }),
  pmsBookingAudit: (id: string) => request<BookingAuditEntry[]>(`/v1/bookings/${id}/audit`),
  // Финансовые документы брони (Счета/Акты) + залоги
  pmsBookingDocs: (id: string) => request<FinanceDoc[]>(`/v1/bookings/${id}/docs`),
  pmsCreateDoc: (id: string, body: { docType: 'INVOICE' | 'RECEIPT' | 'ONLINE' | 'ACT'; buyerType?: 'individual' | 'legal'; buyerName?: string; buyerLegalEntityId?: string; ourLegalEntityId?: string; message?: string; docDate?: string; dueDate?: string; lines: FinanceDocLine[] }) =>
    request<FinanceDoc>(`/v1/bookings/${id}/docs`, { method: 'POST', body }),
  pmsCancelDoc: (docId: string) => request<FinanceDoc>(`/v1/finance-docs/${docId}/cancel`, { method: 'POST' }),
  pmsBookingDeposits: (id: string) => request<Deposit[]>(`/v1/bookings/${id}/deposits`),
  pmsDepositDefault: (id: string) => request<{ amount: number }>(`/v1/bookings/${id}/deposit-default`),
  pmsCreateDeposit: (id: string, body: { type: 'CARD_HOLD' | 'MANUAL'; method?: 'cash' | 'card' | 'transfer'; amount: number; note?: string }) =>
    request<Deposit>(`/v1/bookings/${id}/deposits`, { method: 'POST', body }),
  pmsResolveDeposit: (depId: string, body: { action: 'release' | 'capture' | 'refund'; capturedAmount?: number }) =>
    request<Deposit>(`/v1/deposits/${depId}/resolve`, { method: 'POST', body }),
  pmsQuote: (params: { propertyId: string; roomTypeId: string; ratePlanId: string; checkIn: string; checkOut: string; guests?: number }) => {
    const qs = new URLSearchParams({ propertyId: params.propertyId, roomTypeId: params.roomTypeId, ratePlanId: params.ratePlanId, checkIn: params.checkIn, checkOut: params.checkOut });
    if (params.guests) qs.set('guests', String(params.guests));
    return request<PmsQuote>(`/v1/rates/quote?${qs.toString()}`);
  },
  pmsCancelBooking: (id: string, reason?: string) => request<PmsBooking>(`/v1/bookings/${id}/cancel`, { method: 'POST', body: { reason } }),
  pmsCheckIn: (id: string, roomId?: string) => request<PmsBooking>(`/v1/bookings/${id}/check-in`, { method: 'POST', body: { roomId } }),
  pmsCheckOut: (id: string) => request<PmsBooking>(`/v1/bookings/${id}/check-out`, { method: 'POST' }),
  pmsNoShow: (id: string) => request<PmsBooking>(`/v1/bookings/${id}/no-show`, { method: 'POST' }),

  // PMS · Финансы (реквизиты, приём оплаты, фискализация, 1С)
  financePaymentSystems: () => request<PaymentSystem[]>('/v1/finance/payment-systems'),
  // Контрагенты-покупатели (агентства/компании) — справочник для счетов/актов
  financeCounterparties: (all = false) => request<Counterparty[]>(`/v1/finance/counterparties${all ? '?all=true' : ''}`),
  financeCreateCounterparty: (body: CounterpartyInput) => request<Counterparty>('/v1/finance/counterparties', { method: 'POST', body }),
  financeUpdateCounterparty: (id: string, body: CounterpartyInput) => request<Counterparty>(`/v1/finance/counterparties/${id}`, { method: 'PATCH', body }),
  financeDeleteCounterparty: (id: string) => request<{ ok: boolean }>(`/v1/finance/counterparties/${id}`, { method: 'DELETE' }),
  // Импорт номерного фонда из Bnovo (категории + номера)
  bnovoConfig: () => request<BnovoConfig>('/v1/pms/import/bnovo/config'),
  bnovoSaveConfig: (body: { accountId?: number; apiKey?: string }) =>
    request<BnovoConfig>('/v1/pms/import/bnovo/config', { method: 'PUT', body }),
  bnovoImportPreview: () => request<BnovoImportPreview>('/v1/pms/import/bnovo/preview'),
  bnovoImportApply: (deleteExisting: 'all' | 'empty' | 'hide' | 'none') =>
    request<BnovoImportResult>('/v1/pms/import/bnovo/apply', { method: 'POST', body: { deleteExisting } }),
  financeLegalEntities: () => request<LegalEntity[]>('/v1/finance/legal-entities'),
  financeCreateLegalEntity: (body: LegalEntityInput) => request<LegalEntity>('/v1/finance/legal-entities', { method: 'POST', body }),
  financeUpdateLegalEntity: (id: string, body: LegalEntityInput) => request<LegalEntity>(`/v1/finance/legal-entities/${id}`, { method: 'PATCH', body }),
  financeDeleteLegalEntity: (id: string) => request<{ ok: boolean }>(`/v1/finance/legal-entities/${id}`, { method: 'DELETE' }),
  financeIntegrations: () => request<FinanceIntegration[]>('/v1/finance/integrations'),
  financeToggleIntegration: (id: string, enabled: boolean) => request<FinanceIntegration[]>(`/v1/finance/integrations/${id}`, { method: 'PATCH', body: { enabled } }),
  financeBspb: () => request<BspbAdminConfig>('/v1/finance/bspb'),
  financeSaveBspb: (body: SaveBspbConfigInput) => request<BspbAdminConfig>('/v1/finance/bspb', { method: 'PUT', body }),
  financeTestBspb: (body: Omit<SaveBspbConfigInput, 'card' | 'sbp'>) => request<{ ok: boolean; message: string }>('/v1/finance/bspb/test', { method: 'POST', body }),
  financePaykeeper: () => request<PaykeeperAdminConfig>('/v1/finance/paykeeper'),
  financeSavePaykeeper: (body: SavePaykeeperConfigInput) => request<PaykeeperAdminConfig>('/v1/finance/paykeeper', { method: 'PUT', body }),
  financeTestPaykeeper: (body: Omit<SavePaykeeperConfigInput, 'card' | 'sbp' | 'secret'>) => request<{ ok: boolean; message: string }>('/v1/finance/paykeeper/test', { method: 'POST', body }),
  financeYookassa: () => request<YookassaAdminConfig>('/v1/finance/yookassa'),
  financeSaveYookassa: (body: SaveYookassaConfigInput) => request<YookassaAdminConfig>('/v1/finance/yookassa', { method: 'PUT', body }),
  financeTestYookassa: (body: Omit<SaveYookassaConfigInput, 'card' | 'sbp'>) => request<{ ok: boolean; message: string }>('/v1/finance/yookassa/test', { method: 'POST', body }),
  financeFiscal: () => request<FiscalStatus>('/v1/finance/fiscal'),
  financeAudit: () => request<FinanceAuditEntry[]>('/v1/finance/audit'),

  // PMS · Доступность и блокировки
  pmsAvailabilitySearch: (params: { propertyId?: string; roomTypeId?: string; checkIn: string; checkOut: string; guests?: number }) => {
    const qs = new URLSearchParams({ checkIn: params.checkIn, checkOut: params.checkOut });
    if (params.propertyId) qs.set('propertyId', params.propertyId);
    if (params.roomTypeId) qs.set('roomTypeId', params.roomTypeId);
    if (params.guests) qs.set('guests', String(params.guests));
    return request<PmsAvailabilityRow[]>(`/v1/availability/search?${qs.toString()}`);
  },
  pmsBlocks: (params: { propertyId?: string; roomId?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.propertyId) qs.set('propertyId', params.propertyId);
    if (params.roomId) qs.set('roomId', params.roomId);
    const q = qs.toString();
    return request<PmsRoomBlock[]>(`/v1/availability/blocks${q ? `?${q}` : ''}`);
  },
  pmsCreateBlock: (body: { roomId: string; type?: string; from: string; to: string; reason?: string }) =>
    request<PmsRoomBlock>('/v1/availability/blocks', { method: 'POST', body }),
  pmsRemoveBlock: (id: string) => request<PmsRoomBlock>(`/v1/availability/blocks/${id}`, { method: 'DELETE' }),

  // PMS · Тарифы (Rate Engine)
  pmsRatePlans: (propertyId?: string) => request<PmsRatePlan[]>(`/v1/rate-plans${propertyId ? `?propertyId=${propertyId}` : ''}`),
  pmsCreateRatePlan: (body: { propertyId?: string; name: string; code: string } & RatePlanConfigInput) =>
    request<PmsRatePlan>('/v1/rate-plans', { method: 'POST', body }),
  pmsUpdateRatePlan: (id: string, body: { name?: string } & RatePlanConfigInput) =>
    request<PmsRatePlan>(`/v1/rate-plans/${id}`, { method: 'PATCH', body }),
  pmsDeleteRatePlan: (id: string) => request<{ ok: boolean }>(`/v1/rate-plans/${id}`, { method: 'DELETE' }),
  pmsRateCalendar: (params: { ratePlanId: string; roomTypeId: string; from: string; to: string }) => {
    const qs = new URLSearchParams(params);
    return request<PmsRateCalendarCell[]>(`/v1/rates/calendar?${qs.toString()}`);
  },
  pmsSetPrices: (body: { ratePlanId: string; roomTypeId: string; from: string; to: string; price: number }) =>
    request<{ updated: number }>('/v1/rates/prices', { method: 'PUT', body }),
  pmsBulkPrices: (body: { ratePlanId: string; roomTypeIds: string[]; periods: { from: string; to: string }[]; weekdays?: number[]; mode: 'set' | 'inc_pct' | 'dec_pct' | 'inc_abs' | 'dec_abs'; value: number }) =>
    request<{ updated: number }>('/v1/rates/prices/bulk', { method: 'PUT', body }),
  pmsSetRestrictions: (body: { ratePlanId: string; roomTypeId: string; from: string; to: string; minStay?: number; minStayArrival?: number; maxStay?: number; stopSell?: boolean; closedToArrival?: boolean; closedToDeparture?: boolean }) =>
    request<{ updated: number }>('/v1/rates/restrictions', { method: 'PUT', body }),
  pmsRestrictionGrid: (params: { propertyId?: string; from: string; to: string; ratePlanId?: string; roomTypeId?: string }) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, v); });
    return request<RestrictionGrid>(`/v1/rates/restrictions/grid?${qs.toString()}`);
  },
  pmsBulkRestrictions: (body: {
    ratePlanIds: string[]; roomTypeIds: string[]; from: string; to: string; weekdays?: number[];
    sales?: 'open' | 'close'; arrival?: 'open' | 'close'; departure?: 'open' | 'close';
    minStay?: number; maxStay?: number; minStayArrival?: number;
  }) => request<{ updated: number }>('/v1/rates/restrictions/bulk', { method: 'PUT', body }),
  pmsPromocodes: () => request<Promocode[]>('/v1/promocodes'),
  pmsCreatePromocode: (body: PromocodeInput) => request<Promocode>('/v1/promocodes', { method: 'POST', body }),
  pmsUpdatePromocode: (id: string, body: PromocodeInput) => request<Promocode>(`/v1/promocodes/${id}`, { method: 'PATCH', body }),
  pmsTogglePromocode: (id: string, active: boolean) => request<Promocode>(`/v1/promocodes/${id}/active`, { method: 'PUT', body: { active } }),
  pmsDeletePromocode: (id: string) => request<{ ok: boolean }>(`/v1/promocodes/${id}`, { method: 'DELETE' }),

  // PMS · Маркетинговые словари (Настройки гостиниц → Маркетинг)
  marketingOptions: (kind?: MarketingKind) => request<MarketingOption[]>(`/v1/marketing-options${kind ? `?kind=${kind}` : ''}`),
  createMarketingOption: (body: { kind: MarketingKind; label: string }) => request<MarketingOption>('/v1/marketing-options', { method: 'POST', body }),
  updateMarketingOption: (id: string, body: { label?: string; active?: boolean; sortOrder?: number }) => request<MarketingOption>(`/v1/marketing-options/${id}`, { method: 'PATCH', body }),
  deleteMarketingOption: (id: string) => request<{ ok: boolean }>(`/v1/marketing-options/${id}`, { method: 'DELETE' }),

  // PMS · Channel Manager
  channels: () => request<Channel[]>('/v1/channels'),
  channel: (id: string) => request<ChannelMonitoring>(`/v1/channels/${id}`),
  createChannel: (body: { code: string; name: string; kind?: string; credentials?: Record<string, unknown>; active?: boolean }) =>
    request<Channel>('/v1/channels', { method: 'POST', body }),
  updateChannel: (id: string, body: { name?: string; status?: string; active?: boolean; credentials?: Record<string, unknown> }) =>
    request<Channel>(`/v1/channels/${id}`, { method: 'PATCH', body }),
  channelMappings: (id: string) => request<ChannelMapping>(`/v1/channels/${id}/mappings`),
  setChannelMapping: (id: string, kind: 'property' | 'room-type' | 'rate-plan', body: { localId: string; remoteId: string }) =>
    request<ChannelMapping>(`/v1/channels/${id}/mappings/${kind}`, { method: 'PUT', body }),
  enqueueChannelSync: (id: string, body: { propertyId: string; jobType?: string }) =>
    request<ChannelSyncJob>(`/v1/channels/${id}/sync`, { method: 'POST', body }),
  runChannelSync: () => request<{ processed: number; success: number; failed: number }>('/v1/channels/run-sync', { method: 'POST' }),
  retrySyncJob: (jobId: string) => request<ChannelSyncJob>(`/v1/channels/sync-jobs/${jobId}/retry`, { method: 'POST' }),
  channelSyncJobs: (id: string) => request<ChannelSyncJob[]>(`/v1/channels/${id}/sync-jobs`),
  channelLogs: (id: string) => request<ChannelSyncLog[]>(`/v1/channels/${id}/logs`),
  avitoListings: (id: string) => request<AvitoListing[]>(`/v1/channels/${id}/avito/listings`),
  pollAvito: (id: string) => request<AvitoPollResult>(`/v1/channels/${id}/avito/poll`, { method: 'POST' }),

  // Задачи и Уборка (TASKS-HOUSEKEEPING-TZ) — /v1/ops/*
  opsTasks: (params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    const q = qs.toString();
    return request<OpsTask[]>(`/v1/ops/tasks${q ? `?${q}` : ''}`);
  },
  opsTask: (id: string) => request<OpsTaskFull>(`/v1/ops/tasks/${id}`),
  opsCreateTask: (body: Record<string, unknown>) => request<OpsTask>('/v1/ops/tasks', { method: 'POST', body }),
  opsUpdateTask: (id: string, body: Record<string, unknown>) => request<OpsTask>(`/v1/ops/tasks/${id}`, { method: 'PATCH', body }),
  opsDeleteTask: (id: string) => request<{ ok: boolean }>(`/v1/ops/tasks/${id}`, { method: 'DELETE' }),
  opsStatus: (id: string, to: OpsStatus, note?: string) => request<OpsTask>(`/v1/ops/tasks/${id}/status`, { method: 'POST', body: { to, note } }),
  opsDelegate: (id: string, body: { toUserId?: string; toGroupId?: string; note?: string }) => request<OpsTask>(`/v1/ops/tasks/${id}/delegate`, { method: 'POST', body }),
  opsMarkRead: (id: string) => request<{ ok: boolean }>(`/v1/ops/tasks/${id}/read`, { method: 'POST' }),
  opsClaimable: () => request<OpsTask[]>('/v1/ops/tasks/claimable'),
  opsClaim: (id: string) => request<OpsTask>(`/v1/ops/tasks/${id}/claim`, { method: 'POST' }),
  opsTasksByRoom: (roomId: string) => request<OpsTask[]>(`/v1/ops/tasks/by-room/${roomId}`),
  opsInspect: (id: string) => request<OpsTaskFull>(`/v1/ops/tasks/${id}/inspect`, { method: 'POST' }),
  opsComment: (id: string, body: string) => request(`/v1/ops/tasks/${id}/comments`, { method: 'POST', body: { body } }),
  opsAttach: (id: string, file: File) => upload(`/v1/ops/tasks/${id}/attachments`, file),
  opsAnswer: (taskId: string, clId: string, itemId: string, answer?: string, comment?: string) =>
    request<OpsChecklistAnswer>(`/v1/ops/tasks/${taskId}/checklists/${clId}/answers/${itemId}`, { method: 'POST', body: { answer, comment } }),
  opsAnswerPhoto: (taskId: string, clId: string, itemId: string, file: File) =>
    upload<OpsChecklistAnswer>(`/v1/ops/tasks/${taskId}/checklists/${clId}/answers/${itemId}/photo`, file),
  opsAutocomplete: (taskId: string, clId: string) => request<OpsTaskChecklist>(`/v1/ops/tasks/${taskId}/checklists/${clId}/autocomplete`, { method: 'POST' }),
  opsTaskFromItem: (taskId: string, clId: string, itemId: string, assigneeIds?: string[]) =>
    request<OpsTask>(`/v1/ops/tasks/${taskId}/checklists/${clId}/items/${itemId}/task`, { method: 'POST', body: { assigneeIds } }),
  opsWriteoff: (taskId: string, body: { warehouseId: string; items: { itemId: string; qty: number }[] }) =>
    request<{ id: string; number: string; status: string }>(`/v1/ops/tasks/${taskId}/writeoff`, { method: 'POST', body }),
  opsWriteoffLists: () => request<OpsWriteoffList[]>('/v1/ops/cleaning/writeoff-lists'),
  opsSaveWriteoffList: (body: { name: string; cleaningTypeId?: string; roomTypeId?: string; items: { itemId: string; qty: number }[] }, id?: string) =>
    request<OpsWriteoffList>(id ? `/v1/ops/cleaning/writeoff-lists/${id}` : '/v1/ops/cleaning/writeoff-lists', { method: id ? 'PATCH' : 'POST', body }),
  opsDeleteWriteoffList: (id: string) => request(`/v1/ops/cleaning/writeoff-lists/${id}`, { method: 'DELETE' }),
  opsExportTasks: (params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    return download(`/v1/ops/tasks/export.xlsx?${qs.toString()}`, 'tasks.xlsx');
  },
  opsStaff: () => request<OpsStaff[]>('/v1/ops/staff'),
  opsDuty: (on: boolean) => request<{ onDuty: boolean }>('/v1/ops/duty', { method: 'POST', body: { on } }),
  opsDutyFor: (userId: string, on: boolean) => request<{ onDuty: boolean }>(`/v1/ops/staff/${userId}/duty`, { method: 'POST', body: { on } }),
  opsGroups: () => request<OpsGroup[]>('/v1/ops/groups'),
  opsCreateGroup: (body: { name: string; color?: string; headUserId?: string; parentId?: string }) => request<OpsGroup>('/v1/ops/groups', { method: 'POST', body }),
  opsUpdateGroup: (id: string, body: { name?: string; color?: string; headUserId?: string | null; parentId?: string | null }) => request<OpsGroup>(`/v1/ops/groups/${id}`, { method: 'PATCH', body }),
  opsDeleteGroup: (id: string) => request<{ ok: boolean }>(`/v1/ops/groups/${id}`, { method: 'DELETE' }),
  opsAddGroupMember: (groupId: string, userId: string) => request<unknown>(`/v1/ops/groups/${groupId}/members`, { method: 'POST', body: { userId } }),
  opsRemoveGroupMember: (groupId: string, userId: string) => request<{ ok: boolean }>(`/v1/ops/groups/${groupId}/members/${userId}`, { method: 'DELETE' }),
  opsDnd: (roomId: string, until: string | null) => request(`/v1/ops/rooms/${roomId}/dnd`, { method: 'POST', body: { until: until ?? undefined } }),
  opsCleanRequest: (roomId: string, on: boolean) => request(`/v1/ops/rooms/${roomId}/clean-request`, { method: 'POST', body: { on } }),
  opsTags: () => request<OpsTag[]>('/v1/ops/tags'),
  opsCreateTag: (body: { name: string; color?: string; comment?: string }) => request<OpsTag>('/v1/ops/tags', { method: 'POST', body }),
  opsUpdateTag: (id: string, body: Record<string, unknown>) => request<OpsTag>(`/v1/ops/tags/${id}`, { method: 'PATCH', body }),
  opsChecklists: () => request<OpsChecklist[]>('/v1/ops/checklists'),
  opsSaveChecklist: (body: { name: string; items: Record<string, unknown>[] }, id?: string) =>
    request<OpsChecklist>(id ? `/v1/ops/checklists/${id}` : '/v1/ops/checklists', { method: id ? 'PATCH' : 'POST', body }),
  opsArchiveChecklist: (id: string) => request(`/v1/ops/checklists/${id}`, { method: 'DELETE' }),
  opsTemplates: () => request<OpsTemplate[]>('/v1/ops/templates'),
  opsSaveTemplate: (body: { name: string; payload: Record<string, unknown> }, id?: string) =>
    request<OpsTemplate>(id ? `/v1/ops/templates/${id}` : '/v1/ops/templates', { method: id ? 'PATCH' : 'POST', body }),
  opsDeleteTemplate: (id: string) => request(`/v1/ops/templates/${id}`, { method: 'DELETE' }),
  opsImportTemplates: (file: File) => upload<{ created: number; updated: number; createdTags: number; createdGroups: number }>('/v1/ops/templates/import', file),
  opsSla: () => request<OpsSlaPolicy[]>('/v1/ops/sla'),
  opsSaveSla: (body: { severity: string; guestRequest: boolean; acceptMinutes?: number | null; dueMinutes?: number | null; enabled?: boolean }) =>
    request<OpsSlaPolicy>('/v1/ops/sla', { method: 'POST', body }),
  opsPmRules: () => request<OpsPmRule[]>('/v1/ops/pm-rules'),
  opsSavePmRule: (body: Record<string, unknown>, id?: string) =>
    request<OpsPmRule>(id ? `/v1/ops/pm-rules/${id}` : '/v1/ops/pm-rules', { method: id ? 'PATCH' : 'POST', body }),
  opsDeletePmRule: (id: string) => request(`/v1/ops/pm-rules/${id}`, { method: 'DELETE' }),
  opsGeneratePm: (ruleId?: string) => request<{ created: number }>('/v1/ops/pm-rules/generate', { method: 'POST', body: { ruleId } }),
  opsRepeats: (from: string, to: string, propertyId?: string) => {
    const qs = new URLSearchParams({ from, to });
    if (propertyId) qs.set('propertyId', propertyId);
    return request<OpsRepeatRow[]>(`/v1/ops/reports/repeats?${qs.toString()}`);
  },
  // Web Push сотрудника (уведомления о задачах на закрытой вкладке/телефоне).
  opsPushVapidKey: () => request<{ publicKey: string }>('/v1/ops/push/vapid-key'),
  opsPushStatus: (endpoint?: string) => request<{ devices: number; thisDevice: boolean }>(`/v1/ops/push/status${endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : ''}`),
  opsPushSubscribe: (body: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    request<{ ok: boolean }>('/v1/ops/push/subscribe', { method: 'POST', body }),
  opsPushUnsubscribe: (endpoint: string) => request<{ ok: boolean }>('/v1/ops/push/subscribe', { method: 'DELETE', body: { endpoint } }),
  opsRecurring: () => request<OpsRecurring[]>('/v1/ops/recurring'),
  opsSaveRecurring: (body: Record<string, unknown>, id?: string) =>
    request<OpsRecurring>(id ? `/v1/ops/recurring/${id}` : '/v1/ops/recurring', { method: id ? 'PATCH' : 'POST', body }),
  opsDeleteRecurring: (id: string) => request(`/v1/ops/recurring/${id}`, { method: 'DELETE' }),
  opsAutomation: () => request<OpsAutomation[]>('/v1/ops/automation'),
  opsSaveAutomation: (body: Record<string, unknown>, id?: string) =>
    request<OpsAutomation>(id ? `/v1/ops/automation/${id}` : '/v1/ops/automation', { method: id ? 'PATCH' : 'POST', body }),
  opsDeleteAutomation: (id: string) => request(`/v1/ops/automation/${id}`, { method: 'DELETE' }),
  opsCleaningTypes: () => request<CleaningType[]>('/v1/ops/cleaning/types'),
  opsSaveCleaningType: (body: Record<string, unknown>, id?: string) =>
    request<CleaningType>(id ? `/v1/ops/cleaning/types/${id}` : '/v1/ops/cleaning/types', { method: id ? 'PATCH' : 'POST', body }),
  opsStandards: () => request<CleaningStandard[]>('/v1/ops/cleaning/standards'),
  opsSaveStandard: (body: { cleaningTypeId: string; roomTypeId?: string; minutes: number }) =>
    request<CleaningStandard>('/v1/ops/cleaning/standards', { method: 'POST', body }),
  opsDeleteStandard: (id: string) => request(`/v1/ops/cleaning/standards/${id}`, { method: 'DELETE' }),
  opsRules: () => request<CleaningRule[]>('/v1/ops/cleaning/rules'),
  opsSaveRule: (body: Record<string, unknown>, id?: string) =>
    request<CleaningRule>(id ? `/v1/ops/cleaning/rules/${id}` : '/v1/ops/cleaning/rules', { method: id ? 'PATCH' : 'POST', body }),
  opsDeleteRule: (id: string) => request(`/v1/ops/cleaning/rules/${id}`, { method: 'DELETE' }),
  opsZones: () => request<OpsZone[]>('/v1/ops/zones'),
  opsCreateZone: (body: { propertyId: string; name: string; floor?: string }) => request<OpsZone>('/v1/ops/zones', { method: 'POST', body }),
  opsUpdateZone: (id: string, body: Record<string, unknown>) => request<OpsZone>(`/v1/ops/zones/${id}`, { method: 'PATCH', body }),
  opsSections: () => request<OpsSection[]>('/v1/ops/sections'),
  opsCreateSection: (body: { propertyId: string; name: string }) => request<OpsSection>('/v1/ops/sections', { method: 'POST', body }),
  opsPlan: (date?: string, propertyId?: string) => {
    const qs = new URLSearchParams();
    if (date) qs.set('date', date);
    if (propertyId) qs.set('propertyId', propertyId);
    return request<OpsPlan>(`/v1/ops/cleaning/plan?${qs.toString()}`);
  },
  opsPlanAssign: (taskId: string, userId: string | null, planOrder?: number) =>
    request<OpsTask>('/v1/ops/cleaning/plan/assign', { method: 'POST', body: { taskId, userId: userId ?? undefined, planOrder } }),
  opsPlanAuto: (date: string, propertyId: string, userIds: string[]) =>
    request<OpsPlan>('/v1/ops/cleaning/plan/autodistribute', { method: 'POST', body: { date, propertyId, userIds } }),
  opsPlanSend: (date: string, propertyId?: string, userId?: string) =>
    request<{ sent: number }>('/v1/ops/cleaning/plan/send', { method: 'POST', body: { date, propertyId, userId } }),
  opsPlanCancel: (date: string, propertyId?: string, userId?: string) =>
    request<{ cancelled: number }>('/v1/ops/cleaning/plan/cancel', { method: 'POST', body: { date, propertyId, userId } }),
  opsPlanGenerate: (date?: string, propertyId?: string) =>
    request<{ created: number }>('/v1/ops/cleaning/plan/generate', { method: 'POST', body: { date, propertyId } }),
  opsDashboard: (propertyId?: string) => request<OpsDashboard>(`/v1/ops/reports/dashboard${propertyId ? `?propertyId=${propertyId}` : ''}`),
  opsReportTasks: (from: string, to: string, propertyId?: string) => {
    const qs = new URLSearchParams({ from, to });
    if (propertyId) qs.set('propertyId', propertyId);
    return request<OpsTasksReport>(`/v1/ops/reports/tasks?${qs.toString()}`);
  },
  opsTimeline: (from: string, to: string, propertyId?: string) => {
    const qs = new URLSearchParams({ from, to });
    if (propertyId) qs.set('propertyId', propertyId);
    return request<OpsTimelineDay[]>(`/v1/ops/reports/timeline?${qs.toString()}`);
  },
  opsChecklistAnalytics: (from: string, to: string, propertyId?: string) => {
    const qs = new URLSearchParams({ from, to });
    if (propertyId) qs.set('propertyId', propertyId);
    return request<OpsChecklistAnalytics[]>(`/v1/ops/reports/checklists?${qs.toString()}`);
  },
  opsProReport: (from: string, to: string, propertyId?: string) => {
    const qs = new URLSearchParams({ from, to });
    if (propertyId) qs.set('propertyId', propertyId);
    return request<OpsProReport>(`/v1/ops/reports/pro?${qs.toString()}`);
  },
  opsReportCleanings: (from: string, to: string, propertyId?: string, userId?: string) => {
    const qs = new URLSearchParams({ from, to });
    if (propertyId) qs.set('propertyId', propertyId);
    if (userId) qs.set('userId', userId);
    return request<OpsCleaningRow[]>(`/v1/ops/reports/cleanings?${qs.toString()}`);
  },
  opsExportCleanings: (from: string, to: string, propertyId?: string, userId?: string) => {
    const qs = new URLSearchParams({ from, to });
    if (propertyId) qs.set('propertyId', propertyId);
    if (userId) qs.set('userId', userId);
    return download(`/v1/ops/reports/cleanings/export.xlsx?${qs.toString()}`, 'cleanings-report.xlsx');
  },

  metrics: () => request<AnalyticsMetrics>('/admin/analytics'),
  syncLogs: () => request<SyncLog[]>('/admin/sync-logs'),
  runSync: () => request<{ itemsSynced: number }>('/admin/catalog/sync', { method: 'POST' }),

  checkins: (status?: string) =>
    request<CheckinQueueItem[]>(`/admin/checkin/registrations${status ? `?status=${status}` : ''}`),
  approveCheckin: (bookingId: string) =>
    request(`/admin/checkin/registrations/${bookingId}/approve`, { method: 'POST' }),
  rejectCheckin: (bookingId: string, reason: string, needsFix: boolean) =>
    request(`/admin/checkin/registrations/${bookingId}/reject`, { method: 'POST', body: { reason, needsFix } }),

  // AI и коммуникации · каналы (интеграции)
  aiAgentEnabled: () => request<{ enabled: boolean }>('/ai/channels/ai-agent'),
  aiSetAgentEnabled: (enabled: boolean) => request<{ enabled: boolean }>('/ai/channels/ai-agent', { method: 'PUT', body: { enabled } }),
  aiChannels: () => request<AiChannel[]>('/ai/channels'),
  aiSetChannelEnabled: (id: string, enabled: boolean) =>
    request<AiChannel[]>(`/ai/channels/${id}/enabled`, { method: 'PUT', body: { enabled } }),
  aiTelegramConfig: () => request<TelegramAdminConfig>('/ai/channels/telegram'),
  aiSaveTelegram: (body: { botToken?: string; botUsername?: string; webhookSecret?: string }) =>
    request<TelegramAdminConfig>('/ai/channels/telegram', { method: 'PUT', body }),
  aiTestTelegram: (botToken?: string) =>
    request<{ ok: boolean; message: string }>('/ai/channels/telegram/test', { method: 'POST', body: { botToken } }),
  aiMaxConfig: () => request<MaxAdminConfig>('/ai/channels/max'),
  aiSaveMax: (body: { botToken?: string; botUsername?: string; webhookSecret?: string }) =>
    request<MaxAdminConfig>('/ai/channels/max', { method: 'PUT', body }),
  aiTestMax: (botToken?: string) =>
    request<{ ok: boolean; message: string }>('/ai/channels/max/test', { method: 'POST', body: { botToken } }),
  aiWhatsappState: () => request<WaState>('/ai/channels/whatsapp'),
  aiWhatsappStart: () => request<WaState>('/ai/channels/whatsapp/start', { method: 'POST' }),
  aiWhatsappLogout: () => request<WaState>('/ai/channels/whatsapp/logout', { method: 'POST' }),
  aiTgDirectState: () => request<TgUserbotState>('/ai/channels/tg-direct'),
  aiTgDirectStart: (body: { apiId: string; apiHash: string; phone: string }) =>
    request<TgUserbotState>('/ai/channels/tg-direct/start', { method: 'POST', body }),
  aiTgDirectStartQr: (body: { apiId: string; apiHash: string }) =>
    request<TgUserbotState>('/ai/channels/tg-direct/start-qr', { method: 'POST', body }),
  aiTgDirectCode: (code: string) =>
    request<TgUserbotState>('/ai/channels/tg-direct/code', { method: 'POST', body: { code } }),
  aiTgDirectPassword: (password: string) =>
    request<TgUserbotState>('/ai/channels/tg-direct/password', { method: 'POST', body: { password } }),
  aiTgDirectLogout: () => request<TgUserbotState>('/ai/channels/tg-direct/logout', { method: 'POST' }),
  aiUmnicoConfig: () => request<UmnicoAdminConfig>('/ai/channels/umnico'),
  aiUmnicoChannels: () => request<UmnicoChannel[]>('/ai/channels/umnico/channels'),
  aiSaveUmnico: (body: { token?: string }) => request<UmnicoAdminConfig>('/ai/channels/umnico', { method: 'PUT', body }),
  aiTestUmnico: (token?: string) => request<{ ok: boolean; message: string }>('/ai/channels/umnico/test', { method: 'POST', body: { token } }),
  aiUmnicoWebhooks: () => request<{ id: number; url: string; name?: string; status?: number }[]>('/ai/channels/umnico/webhooks'),
  aiRegisterUmnicoWebhook: (url: string) => request<{ ok: boolean; message: string; id?: number }>('/ai/channels/umnico/webhook-register', { method: 'POST', body: { url } }),
  /** Полный публичный URL нашего вебхука Umnico (тот же API-base, что и все запросы). */
  aiUmnicoWebhookUrl: () => `${API_BASE}/ai/umnico/webhook`,
  aiEmailConfig: () => request<EmailAdminConfig>('/ai/channels/email'),
  aiSaveEmail: (body: { host?: string; port?: number; secure?: boolean; user?: string; pass?: string; from?: string; proxy?: string }) =>
    request<EmailAdminConfig>('/ai/channels/email', { method: 'PUT', body }),
  aiTestEmail: () => request<{ ok: boolean; message: string }>('/ai/channels/email/test', { method: 'POST' }),

  searchGuests: (q: string) =>
    request<GuestSearchResult[]>(`/admin/guests?q=${encodeURIComponent(q)}`),
  guestsList: (params: { q?: string; tier?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.tier) qs.set('tier', params.tier);
    const s = qs.toString();
    return request<GuestListRow[]>(`/admin/guests-list${s ? `?${s}` : ''}`);
  },
  guest: (id: string) => request<GuestDetails>(`/admin/guests/${id}`),
  updateGuest: (id: string, body: { firstName?: string; lastName?: string; phone?: string; email?: string; guestNotes?: string }) =>
    request<GuestSearchResult>(`/admin/guests/${id}`, { method: 'PATCH', body }),
  accrue: (guestId: string, amount: number, comment: string) =>
    request(`/admin/loyalty/${guestId}/accrue`, { method: 'POST', body: { amount, comment } }),
  deduct: (guestId: string, amount: number, comment: string) =>
    request(`/admin/loyalty/${guestId}/deduct`, { method: 'POST', body: { amount, comment } }),
  adjustTier: (guestId: string, tier: string) =>
    request(`/admin/loyalty/${guestId}/tier`, { method: 'PUT', body: { tier } }),
  issueKey: (bookingId: string) =>
    request(`/admin/bookings/${bookingId}/key/issue`, { method: 'POST' }),
  revokeKey: (bookingId: string) =>
    request(`/admin/bookings/${bookingId}/key/revoke`, { method: 'POST' }),

  // Замки
  catalogProperties: () => request<PropertyTree[]>('/catalog/properties'),
  ttlockLocks: () => request<TtlockLock[]>('/admin/ttlock/locks'),
  locks: (propertyId?: string) =>
    request<DbLock[]>(`/admin/locks${propertyId ? `?propertyId=${propertyId}` : ''}`),
  createLock: (body: {
    propertyId: string;
    ttlockLockId: string;
    name: string;
    target: string;
    coverage?: LockCoverage;
    coverageFloor?: string;
    roomIds?: string[];
    hasGateway?: boolean;
  }) => request<DbLock>('/admin/locks', { method: 'POST', body }),
  setLockCoverage: (
    lockId: string,
    body: { coverage: LockCoverage; coverageFloor?: string; roomIds?: string[] },
  ) => request<{ ok: true }>(`/admin/locks/${lockId}/coverage`, { method: 'PUT', body }),
  linkLock: (lockId: string, roomId: string) =>
    request(`/admin/locks/${lockId}/link`, { method: 'POST', body: { roomId } }),
  unlinkLock: (lockId: string, roomId: string) =>
    request(`/admin/locks/${lockId}/unlink`, { method: 'POST', body: { roomId } }),
  deleteLock: (lockId: string) =>
    request<{ ok: true }>(`/admin/locks/${lockId}`, { method: 'DELETE' }),

  // Пульт TTLock
  ttlockCreds: () => request<TtlockCreds>('/admin/ttlock/credentials'),
  setTtlockCreds: (username: string, password?: string) =>
    request<{ ok: true }>('/admin/ttlock/credentials', { method: 'PUT', body: { username, password } }),
  ttlockPasscode: (body: { ttlockLockId: string; name?: string; pin?: string; startMs: number; endMs: number; mode?: 'get' | 'add' }) =>
    request<PasscodeResult>('/admin/ttlock/passcode', { method: 'POST', body }),
  ttlockEkey: (body: { ttlockLockId: string; receiverUsername: string; name?: string; startMs: number; endMs: number; remarks?: string }) =>
    request<EkeyResult>('/admin/ttlock/ekey', { method: 'POST', body }),
  ttlockUnlock: (ttlockLockId: string) =>
    request<{ ok: true }>('/admin/ttlock/unlock', { method: 'POST', body: { ttlockLockId } }),
  ttlockRecords: (ttlockLockId: string, from?: number, to?: number) =>
    request<LockRecord[]>(`/admin/ttlock/records?ttlockLockId=${ttlockLockId}${from ? `&from=${from}` : ''}${to ? `&to=${to}` : ''}`),

  // Словарь удобств (фильтры)
  amenities: () => request<Amenity[]>('/admin/amenities'),
  amenityCategories: () => request<AmenityCategoryOption[]>('/admin/amenity-categories'),
  createAmenity: (body: { code: string; label: string; category: string; icon?: string | null; isFilter?: boolean; sortOrder?: number }) =>
    request<Amenity>('/admin/amenities', { method: 'POST', body }),
  updateAmenity: (id: string, body: Partial<Pick<Amenity, 'label' | 'category' | 'icon' | 'isFilter' | 'sortOrder' | 'active'>>) =>
    request<Amenity>(`/admin/amenities/${id}`, { method: 'PATCH', body }),
  deleteAmenity: (id: string) => request(`/admin/amenities/${id}`, { method: 'DELETE' }),

  // Карточки номеров
  roomTypes: () => request<RoomTypeAdmin[]>('/admin/room-types'),
  updateRoomType: (
    id: string,
    body: Partial<Pick<RoomTypeAdmin, 'name' | 'description' | 'areaSqm' | 'bedType' | 'capacity' | 'amenities' | 'photos' | 'active'>>,
  ) => request<RoomTypeAdmin>(`/admin/room-types/${id}`, { method: 'PATCH', body }),

  // Дополнительные услуги (конструктор)
  extras: () => request<Extra[]>('/admin/extras'),
  ratePlanKinds: () => request<RatePlanKind[]>('/catalog/rate-plan-kinds'),
  createExtra: (body: Partial<Extra>) => request<Extra>('/admin/extras', { method: 'POST', body }),
  updateExtra: (id: string, body: Partial<Extra>) => request<Extra>(`/admin/extras/${id}`, { method: 'PATCH', body }),
  deleteExtra: (id: string) => request(`/admin/extras/${id}`, { method: 'DELETE' }),

  promocodes: () => request<Promocode[]>('/admin/promocodes'),
  createPromocode: (body: { code: string; type: string; value: number }) =>
    request<Promocode>('/admin/promocodes', { method: 'POST', body }),
  togglePromocode: (id: string, active: boolean) =>
    request(`/admin/promocodes/${id}/active`, { method: 'PUT', body: { active } }),

  // ─── Складской учёт ───
  whMeta: () => request<WhMeta>('/warehouse/meta'),
  whDashboard: () => request<WhDashboard>('/warehouse/dashboard'),
  whBalances: (params: {
    warehouseId?: string;
    addressId?: string;
    categoryId?: string;
    q?: string;
    zero?: boolean;
    belowMin?: boolean;
    expiringDays?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.warehouseId) qs.set('warehouseId', params.warehouseId);
    if (params.addressId) qs.set('addressId', params.addressId);
    if (params.categoryId) qs.set('categoryId', params.categoryId);
    if (params.q) qs.set('q', params.q);
    if (params.zero) qs.set('zero', '1');
    if (params.belowMin) qs.set('belowMin', '1');
    if (params.expiringDays) qs.set('expiringDays', String(params.expiringDays));
    const s = qs.toString();
    return request<WhBalanceRow[]>(`/warehouse/balances${s ? `?${s}` : ''}`);
  },

  whAddresses: () => request<WhAddress[]>('/warehouse/addresses'),
  whCreateAddress: (body: Partial<WhAddress>) => request<WhAddress>('/warehouse/addresses', { method: 'POST', body }),
  whUpdateAddress: (id: string, body: Partial<WhAddress>) => request<WhAddress>(`/warehouse/addresses/${id}`, { method: 'PATCH', body }),
  whWarehouses: () => request<WhWarehouse[]>('/warehouse/warehouses'),
  whCreateWarehouse: (body: Partial<WhWarehouse>) => request<WhWarehouse>('/warehouse/warehouses', { method: 'POST', body }),
  whUpdateWarehouse: (id: string, body: Partial<WhWarehouse>) => request<WhWarehouse>(`/warehouse/warehouses/${id}`, { method: 'PATCH', body }),

  whCategories: () => request<WhCategory[]>('/warehouse/categories'),
  whCreateCategory: (body: { name: string; sortOrder?: number }) => request<WhCategory>('/warehouse/categories', { method: 'POST', body }),
  whItems: (params: { q?: string; categoryId?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.categoryId) qs.set('categoryId', params.categoryId);
    const s = qs.toString();
    return request<WhItem[]>(`/warehouse/items${s ? `?${s}` : ''}`);
  },
  whCreateItem: (body: Partial<WhItem>) => request<WhItem>('/warehouse/items', { method: 'POST', body }),
  whUpdateItem: (id: string, body: Partial<WhItem>) => request<WhItem>(`/warehouse/items/${id}`, { method: 'PATCH', body }),

  whSuppliers: () => request<WhSupplier[]>('/warehouse/suppliers'),
  whCreateSupplier: (body: Partial<WhSupplier>) => request<WhSupplier>('/warehouse/suppliers', { method: 'POST', body }),
  whUpdateSupplier: (id: string, body: Partial<WhSupplier>) => request<WhSupplier>(`/warehouse/suppliers/${id}`, { method: 'PATCH', body }),

  whDocuments: (params: { type?: string; status?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.type) qs.set('type', params.type);
    if (params.status) qs.set('status', params.status);
    const s = qs.toString();
    return request<WhDocumentRow[]>(`/warehouse/documents${s ? `?${s}` : ''}`);
  },
  whDocument: (id: string) => request<WhDocumentDetail>(`/warehouse/documents/${id}`),
  whCreateReceipt: (body: {
    toWarehouseId: string;
    supplierId?: string;
    externalRef?: string;
    comment?: string;
    lines: ReceiptLineInput[];
  }) => request<WhDocumentDetail>('/warehouse/documents', { method: 'POST', body: { type: 'RECEIPT', ...body } }),
  whCreateWriteOff: (body: {
    fromWarehouseId: string;
    reason: string;
    comment?: string;
    lines: { itemId: string; quantity: number; batch?: string; expiryDate?: string }[];
  }) => request<WhDocumentDetail>('/warehouse/documents', { method: 'POST', body: { type: 'WRITE_OFF', ...body } }),
  whCreateReturn: (body: {
    fromWarehouseId: string;
    reason: string;
    comment?: string;
    lines: { itemId: string; quantity: number; batch?: string; expiryDate?: string }[];
  }) => request<WhDocumentDetail>('/warehouse/documents', { method: 'POST', body: { type: 'RETURN', ...body } }),
  whApproveDocument: (id: string) => request<WhDocumentRow>(`/warehouse/documents/${id}/approve`, { method: 'POST' }),
  whPostDocument: (id: string) => request<WhDocumentRow>(`/warehouse/documents/${id}/post`, { method: 'POST' }),
  whShipDocument: (id: string) => request<WhDocumentRow>(`/warehouse/documents/${id}/ship`, { method: 'POST' }),
  whReceiveDocument: (id: string, lines: { lineId: string; receivedQty: number }[]) =>
    request<WhDocumentRow>(`/warehouse/documents/${id}/receive`, { method: 'POST', body: { lines } }),
  whCancelDocument: (id: string) => request<WhDocumentRow>(`/warehouse/documents/${id}/cancel`, { method: 'POST' }),

  whAudit: (entityId?: string) => request<WhAuditEntry[]>(`/warehouse/audit${entityId ? `?entityId=${entityId}` : ''}`),

  // Инвентаризация
  whInventories: () => request<WhInventoryRow[]>('/warehouse/inventories'),
  whInventory: (id: string) => request<WhInventoryDetail>(`/warehouse/inventories/${id}`),
  whStartInventory: (body: { warehouseId: string; categoryId?: string; comment?: string }) =>
    request<WhInventoryDetail>('/warehouse/inventories', { method: 'POST', body }),
  whUpdateInventoryFacts: (id: string, lines: InventoryFactInput[]) =>
    request<WhInventoryDetail>(`/warehouse/inventories/${id}/facts`, { method: 'PATCH', body: { lines } }),
  whSubmitInventory: (id: string) => request<WhInventoryRow>(`/warehouse/inventories/${id}/submit`, { method: 'POST' }),
  whApproveInventory: (id: string) => request<WhInventoryRow>(`/warehouse/inventories/${id}/approve`, { method: 'POST' }),
  whCancelInventory: (id: string) => request<WhInventoryRow>(`/warehouse/inventories/${id}/cancel`, { method: 'POST' }),

  // Нормы расхода и перерасход
  whNorms: () => request<WhNorm[]>('/warehouse/norms'),
  whCreateNorm: (body: { itemId: string; addressId?: string; roomCategory?: string; unit: string; normQuantity: number }) =>
    request<WhNorm>('/warehouse/norms', { method: 'POST', body }),
  whDeleteNorm: (id: string) => request(`/warehouse/norms/${id}`, { method: 'DELETE' }),
  // Отчёты §6.7 (строки рендерятся по колонкам на странице)
  whReportStockValue: () => request<Record<string, unknown>[]>('/warehouse/reports/stock-value'),
  whReportMovements: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return request<Record<string, unknown>[]>(`/warehouse/reports/movements${qs.toString() ? `?${qs}` : ''}`);
  },
  whReportConsumption: (groupBy: string, from?: string, to?: string) => {
    const qs = new URLSearchParams({ groupBy });
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return request<Record<string, unknown>[]>(`/warehouse/reports/consumption?${qs}`);
  },
  whReportLosses: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return request<Record<string, unknown>[]>(`/warehouse/reports/losses${qs.toString() ? `?${qs}` : ''}`);
  },
  whReportLowStock: () => request<Record<string, unknown>[]>('/warehouse/reports/low-stock'),
  whReportExpiry: (days?: number) => request<Record<string, unknown>[]>(`/warehouse/reports/expiry${days ? `?days=${days}` : ''}`),
  whReportRequests: () => request<Record<string, unknown>[]>('/warehouse/reports/requests'),
  whReportInventoryDiffs: () => request<Record<string, unknown>[]>('/warehouse/reports/inventory-diffs'),

  // Excel импорт/экспорт (§18)
  whExportItems: () => download('/warehouse/items/export', 'nomenklatura.xlsx'),
  whImportItems: (file: File) => upload<{ created: number; updated: number; skipped: number; errors: string[] }>('/warehouse/items/import', file),
  whExportBalances: () => download('/warehouse/balances/export', 'ostatki.xlsx'),
  whExportReport: (report: string, qs = '') => download(`/warehouse/reports/${report}/export${qs}`, `report-${report}.xlsx`),

  whOverspend: (params: { addressId: string; from?: string; to?: string; roomNights?: number; stays?: number; guests?: number; cleanings?: number }) => {
    const qs = new URLSearchParams({ addressId: params.addressId });
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.roomNights) qs.set('roomNights', String(params.roomNights));
    if (params.stays) qs.set('stays', String(params.stays));
    if (params.guests) qs.set('guests', String(params.guests));
    if (params.cleanings) qs.set('cleanings', String(params.cleanings));
    return request<WhOverspendRow[]>(`/warehouse/reports/overspend?${qs.toString()}`);
  },

  // Заявки на пополнение
  whRecommendations: (addressId: string) => request<WhRecommendation[]>(`/warehouse/requests/recommendations?addressId=${addressId}`),
  whRequests: (status?: string) => request<WhRequestRow[]>(`/warehouse/requests${status ? `?status=${status}` : ''}`),
  whRequest: (id: string) => request<WhRequestDetail>(`/warehouse/requests/${id}`),
  whCreateRequest: (body: { addressId: string; priority?: string; desiredDate?: string; comment?: string; lines: RequestLineInput[] }) =>
    request<WhRequestDetail>('/warehouse/requests', { method: 'POST', body }),
  whApproveRequest: (id: string) => request<WhRequestRow>(`/warehouse/requests/${id}/approve`, { method: 'POST' }),
  whRejectRequest: (id: string, reason?: string) => request<WhRequestRow>(`/warehouse/requests/${id}/reject`, { method: 'POST', body: { reason } }),
  whCreateTransferFromRequest: (id: string) => request<WhDocumentRow>(`/warehouse/requests/${id}/create-transfer`, { method: 'POST' }),

  // ─── База знаний (KB-DRIVE-TZ.md) ───
  kbBases: () => request<KbBaseRow[]>('/v1/kb/bases'),
  kbCreateBase: (body: { name?: string; icon?: string | null }) => request<KbBaseRow>('/v1/kb/bases', { method: 'POST', body }),
  kbUpdateBase: (id: string, body: { name?: string; icon?: string | null; sortOrder?: number }) =>
    request<KbBaseRow>(`/v1/kb/bases/${id}`, { method: 'PATCH', body }),
  kbDeleteBase: (id: string) => request<{ ok: boolean }>(`/v1/kb/bases/${id}`, { method: 'DELETE' }),
  kbPages: (baseId: string) => request<KbPageNode[]>(`/v1/kb/bases/${baseId}/pages`),
  kbPage: (id: string) => request<KbPageDetail>(`/v1/kb/pages/${id}`),
  kbCreatePage: (body: { baseId: string; parentId?: string | null; title?: string }) =>
    request<KbPageDetail>('/v1/kb/pages', { method: 'POST', body }),
  kbUpdatePage: (id: string, body: Partial<Pick<KbPageDetail, 'title' | 'icon' | 'content' | 'parentId' | 'sortOrder' | 'status' | 'tags' | 'guestAgentVisible'>>) =>
    request<KbPageDetail>(`/v1/kb/pages/${id}`, { method: 'PATCH', body }),
  kbDeletePage: (id: string) => request<{ ok: boolean; deleted: number }>(`/v1/kb/pages/${id}`, { method: 'DELETE' }),
  kbVersions: (pageId: string) => request<KbVersionRow[]>(`/v1/kb/pages/${pageId}/versions`),
  kbVersion: (pageId: string, n: number) =>
    request<KbVersionRow & { content: { blocks: KbBlock[] } }>(`/v1/kb/pages/${pageId}/versions/${n}`),
  /** Мягкая блокировка редактирования (§3.2): захват/heartbeat, release, force-перехват. */
  kbEditing: (pageId: string, body: { release?: boolean; force?: boolean }) =>
    request<{ ok?: boolean; locked?: boolean; lockedByName?: string }>(`/v1/kb/pages/${pageId}/editing`, { method: 'POST', body }),
  kbRestoreVersion: (pageId: string, n: number) => request<KbPageDetail>(`/v1/kb/pages/${pageId}/versions/${n}/restore`, { method: 'POST' }),
  kbSearch: (q: string) => request<KbSearchHit[]>(`/v1/kb/search?q=${encodeURIComponent(q)}`),
  kbAsk: (question: string) => request<KbAskResult>('/v1/kb/ask', { method: 'POST', body: { question } }),
  kbResolve: (shortId: string) => request<KbPageNode>(`/v1/kb/r/${shortId}`),
  kbImportDryRun: (file: File) => upload<{ token: string; report: KbImportReport }>('/v1/kb/import/bitrix24', file),
  kbImportConfirm: (token: string, mode: 'skip' | 'update') =>
    request<KbImportResult>('/v1/kb/import/bitrix24/confirm', { method: 'POST', body: { token, mode } }),
  kbImportJobs: () => request<KbImportJobRow[]>('/v1/kb/import/jobs'),

  // ─── Диск (KB-DRIVE-TZ.md §5) ───
  driveList: (parentId?: string | null) =>
    request<{ nodes: DriveNodeRow[]; breadcrumbs: { id: string; name: string }[] }>(`/v1/drive/nodes${parentId ? `?parentId=${parentId}` : ''}`),
  driveSearch: (q: string) => request<DriveNodeRow[]>(`/v1/drive/search?q=${encodeURIComponent(q)}`),
  driveTrash: () => request<DriveNodeRow[]>('/v1/drive/trash'),
  driveUsage: () => request<{ usedBytes: number; quotaBytes: number | null }>('/v1/drive/usage'),
  driveResolve: (shortId: string) => request<DriveNodeRow>(`/v1/drive/r/${shortId}`),
  driveCreateFolder: (body: { parentId?: string | null; name?: string }) =>
    request<DriveNodeRow>('/v1/drive/folders', { method: 'POST', body }),
  driveUpload: (file: File, parentId?: string | null) =>
    upload<DriveNodeRow>('/v1/drive/upload', file, parentId ? { parentId } : {}),
  driveRename: (id: string, name: string) => request<DriveNodeRow>(`/v1/drive/nodes/${id}`, { method: 'PATCH', body: { name } }),
  driveMove: (id: string, parentId: string | null) =>
    request<DriveNodeRow>(`/v1/drive/nodes/${id}`, { method: 'PATCH', body: { parentId } }),
  driveDelete: (id: string) => request<{ ok: boolean; trashed: number }>(`/v1/drive/nodes/${id}`, { method: 'DELETE' }),
  driveRestore: (id: string) => request<{ ok: boolean; restored: number }>(`/v1/drive/nodes/${id}/restore`, { method: 'POST' }),
  drivePurge: (id: string) => request<{ ok: boolean; purged: number }>(`/v1/drive/nodes/${id}/purge`, { method: 'DELETE' }),
  driveVersions: (id: string) => request<DriveVersionRow[]>(`/v1/drive/files/${id}/versions`),
  driveCreateMindmap: (body: { parentId?: string | null; name?: string }) =>
    request<DriveNodeRow>('/v1/drive/mindmaps', { method: 'POST', body }),
  driveFileContent: (id: string) =>
    request<{ id: string; name: string; mime: string | null; version: number; content: string }>(`/v1/drive/files/${id}/content`),
  driveSaveContent: (id: string, content: string) =>
    request<DriveNodeRow>(`/v1/drive/files/${id}/content`, { method: 'PUT', body: { content } }),
  /** Сессия онлайн-редактирования Office (Collabora/WOPI, §5.2). 400 — если не настроено. */
  driveEditSession: (id: string) =>
    request<{ editorUrl: string }>(`/v1/drive/files/${id}/edit-session`, { method: 'POST' }),
  driveDownload: (id: string, name: string, v?: number) =>
    download(`/v1/drive/files/${id}/download${v ? `?v=${v}` : ''}`, name),
  /** Blob-URL файла для предпросмотра (<img>/<iframe> не умеют слать Authorization). */
  driveFileBlobUrl: async (id: string): Promise<string> => {
    const token = adminToken.get();
    const res = await fetch(`${API_BASE}/v1/drive/files/${id}/download?inline=1`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new ApiError(res.status, `Предпросмотр недоступен (${res.status})`);
    return URL.createObjectURL(await res.blob());
  },

  // Публичные ссылки (общие для БЗ и Диска)
  linkCreate: (body: { resourceType: 'kb_page' | 'drive_file'; resourceId: string; expiresDays?: number }) =>
    request<PublicLinkRow>('/v1/links', { method: 'POST', body }),
  linksFor: (resourceType: 'kb_page' | 'drive_file', resourceId: string) =>
    request<PublicLinkRow[]>(`/v1/links/${resourceType}/${resourceId}`),
  linkRevoke: (id: string) => request<PublicLinkRow>(`/v1/links/${id}`, { method: 'DELETE' }),
  linksActive: () => request<ActivePublicLinkRow[]>('/v1/links/active'),

  // Точечные доступы (ACL) и группы (KB-DRIVE-TZ.md §2)
  aclSubjects: () => request<AclSubjectsCatalog>('/v1/acl/subjects'),
  aclList: (resourceType: AclResourceType, resourceId: string) =>
    request<AclEntryRow[]>(`/v1/acl/${resourceType}/${resourceId}`),
  aclSet: (resourceType: AclResourceType, resourceId: string, entries: AclEntryInput[]) =>
    request<AclEntryRow[]>(`/v1/acl/${resourceType}/${resourceId}`, { method: 'PUT', body: { entries } }),
  groups: () => request<UserGroupRow[]>('/v1/groups'),
  groupCreate: (body: { name: string; color?: string; headUserId?: string; parentId?: string }) => request<UserGroupRow>('/v1/groups', { method: 'POST', body }),
  groupUpdate: (id: string, body: { name?: string; memberIds?: string[]; color?: string; headUserId?: string | null; parentId?: string | null }) =>
    request<UserGroupRow>(`/v1/groups/${id}`, { method: 'PATCH', body }),
  groupDelete: (id: string) => request<{ ok: boolean }>(`/v1/groups/${id}`, { method: 'DELETE' }),

  // Секреты (KB-DRIVE-TZ.md §8)
  secretsList: () => request<SecretRow[]>('/v1/secrets'),
  secretCreate: (body: SecretInput) => request<SecretRow>('/v1/secrets', { method: 'POST', body }),
  secretUpdate: (id: string, body: SecretInput) => request<SecretRow>(`/v1/secrets/${id}`, { method: 'PATCH', body }),
  secretDelete: (id: string) => request<{ ok: boolean }>(`/v1/secrets/${id}`, { method: 'DELETE' }),
  secretReveal: (id: string) => request<{ password: string }>(`/v1/secrets/${id}/reveal`, { method: 'POST' }),
  secretViews: (id: string) => request<SecretViewRow[]>(`/v1/secrets/${id}/views`),
  secretTasks: (status?: string) => request<SecretTaskRow[]>(`/v1/secrets/tasks/list${status ? `?status=${status}` : ''}`),
  secretTaskClose: (id: string, body: { newPassword?: string; dismiss?: boolean }) =>
    request<{ ok?: boolean }>(`/v1/secrets/tasks/${id}/close`, { method: 'POST', body }),

  // AI · Контроль качества чатов (§5.7)
  qaDashboard: (days = 30) => request<QaDashboard>(`/ai/qa/dashboard?days=${days}`),
  qaReviews: (opts: { operatorId?: string; limit?: number } = {}) => {
    const q = new URLSearchParams();
    if (opts.operatorId) q.set('operatorId', opts.operatorId);
    if (opts.limit) q.set('limit', String(opts.limit));
    const qs = q.toString();
    return request<QaReviewRow[]>(`/ai/qa/reviews${qs ? `?${qs}` : ''}`);
  },
  qaReview: (conversationId: string) => request<QaReviewRow>(`/ai/qa/reviews/${conversationId}`),
  qaAnalyze: (conversationId: string) =>
    request<QaReviewRow>(`/ai/qa/analyze/${conversationId}`, { method: 'POST' }),
  qaAnalyzePending: (limit = 20) =>
    request<{ requested: number; analyzed: number }>('/ai/qa/analyze-pending', {
      method: 'POST',
      body: { limit },
    }),

  // AI · Лента эскалаций (operator inbox §4.7)
  inboxList: () => request<InboxConversationRow[]>('/ai/inbox'),
  inboxAll: (opts: { status?: string; channel?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.status) q.set('status', opts.status);
    if (opts.channel) q.set('channel', opts.channel);
    const qs = q.toString();
    return request<GuestConversationRow[]>(`/ai/inbox/all${qs ? `?${qs}` : ''}`);
  },
  inboxThread: (id: string) => request<InboxThread>(`/ai/inbox/${id}`),
  inboxAssign: (id: string) => request<unknown>(`/ai/inbox/${id}/assign`, { method: 'POST' }),
  inboxReply: (id: string, text: string) =>
    request<{ ok: true }>(`/ai/inbox/${id}/reply`, { method: 'POST', body: { text } }),
  inboxClose: (id: string) => request<{ ok: true }>(`/ai/inbox/${id}/close`, { method: 'POST' }),
  inboxOperators: () => request<InboxOperator[]>('/ai/inbox/operators'),
  inboxDelegate: (id: string, operatorId: string, note?: string) =>
    request<{ ok: true }>(`/ai/inbox/${id}/delegate`, { method: 'POST', body: { operatorId, note } }),

  // AI · Копилот сотрудника (§3): чат с DeepSeek в пределах прав роли
  copilotMessage: (text: string, conversationId?: string) =>
    request<CopilotResult>('/ai/copilot/message', { method: 'POST', body: { text, conversationId } }),
  copilotConfirm: (conversationId: string, decisions: CopilotDecision[]) =>
    request<CopilotResult>('/ai/copilot/confirm', { method: 'POST', body: { conversationId, decisions } }),

  // Мессенджер сотрудников (§2)
  staffColleagues: () => request<StaffColleague[]>('/staff-chat/colleagues'),
  staffDepartments: () => request<StaffDepartment[]>('/staff-chat/departments'),
  staffUnread: () => request<{ unread: number }>('/staff-chat/unread'),
  staffSearchAll: (q: string) => request<StaffGlobalSearchResult[]>(`/staff-chat/search-all?q=${encodeURIComponent(q)}`),
  staffChatMedia: (id: string) => request<StaffChatMedia>(`/staff-chat/chats/${id}/media`),
  staffChatCommon: (id: string) => request<{ id: string; title: string }[]>(`/staff-chat/chats/${id}/common`),
  opsBadge: () => request<{ count: number }>('/v1/ops/tasks/badge'),
  staffChats: () => request<StaffChatListItem[]>('/staff-chat/chats'),
  staffCreateDm: (userId: string) =>
    request<{ id: string }>('/staff-chat/chats/dm', { method: 'POST', body: { userId } }),
  staffCreateGroup: (title: string, memberIds: string[]) =>
    request<{ id: string }>('/staff-chat/chats/group', { method: 'POST', body: { title, memberIds } }),
  staffMessages: (id: string, before?: string) =>
    request<StaffMessagesResponse>(
      `/staff-chat/chats/${id}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    ),
  staffSend: (id: string, text: string, replyToId?: string, mentionIds?: string[]) =>
    request<StaffMessage>(`/staff-chat/chats/${id}/messages`, {
      method: 'POST',
      body: { text, replyToId, mentionIds },
    }),
  staffMembers: (id: string) => request<StaffMember[]>(`/staff-chat/chats/${id}/members`),
  staffRead: (id: string) => request<{ ok: true }>(`/staff-chat/chats/${id}/read`, { method: 'POST' }),
  staffTyping: (id: string) =>
    request<{ ok: true }>(`/staff-chat/chats/${id}/typing`, { method: 'POST' }),
  staffReact: (id: string, messageId: string, emoji: string) =>
    request<{ ok: true }>(`/staff-chat/chats/${id}/messages/${messageId}/react`, {
      method: 'POST',
      body: { emoji },
    }),
  staffEditMessage: (id: string, messageId: string, text: string) =>
    request<{ ok: true }>(`/staff-chat/chats/${id}/messages/${messageId}`, {
      method: 'PATCH',
      body: { text },
    }),
  staffDeleteMessage: (id: string, messageId: string) =>
    request<{ ok: true }>(`/staff-chat/chats/${id}/messages/${messageId}`, { method: 'DELETE' }),
  staffSearch: (id: string, q: string) =>
    request<StaffSearchResult[]>(`/staff-chat/chats/${id}/search?q=${encodeURIComponent(q)}`),
  staffPins: (id: string) => request<StaffPin[]>(`/staff-chat/chats/${id}/pins`),
  staffPin: (id: string, messageId: string) =>
    request<{ pinned: boolean }>(`/staff-chat/chats/${id}/messages/${messageId}/pin`, {
      method: 'POST',
    }),
  staffSave: (id: string, messageId: string) =>
    request<{ saved: boolean }>(`/staff-chat/chats/${id}/messages/${messageId}/save`, {
      method: 'POST',
    }),
  staffSaved: () => request<StaffSavedMessageItem[]>('/staff-chat/saved'),
  staffFolders: () => request<StaffFolder[]>('/staff-chat/folders'),
  staffCreateFolder: (name: string) =>
    request<StaffFolder>('/staff-chat/folders', { method: 'POST', body: { name } }),
  staffUpdateFolder: (id: string, body: { name?: string; chatIds?: string[]; order?: number }) =>
    request<StaffFolder>(`/staff-chat/folders/${id}`, { method: 'PATCH', body }),
  staffDeleteFolder: (id: string) =>
    request<{ ok: true }>(`/staff-chat/folders/${id}`, { method: 'DELETE' }),
  staffSendAttachment: (id: string, file: File, text?: string) =>
    upload<StaffMessage>(`/staff-chat/chats/${id}/attachment`, file, text ? { text } : {}),
  staffNotify: (id: string, body: { mode?: 'ALL' | 'MENTIONS' | 'NONE'; muteHours?: number }) =>
    request<{ notifyMode: string; muted: boolean }>(`/staff-chat/chats/${id}/notify`, {
      method: 'POST',
      body,
    }),

  // Бонусная программа сотрудников (§7)
  bonusMe: () => request<BonusOverview>('/v1/bonus/me'),
  bonusLeaderboard: (period: 'all' | 'month' = 'all') =>
    request<BonusLeaderRow[]>(`/v1/bonus/leaderboard?period=${period}`),
  bonusRules: (activeOnly = false) =>
    request<BonusRule[]>(`/v1/bonus/rules${activeOnly ? '?activeOnly=1' : ''}`),
  bonusRecipients: () => request<BonusUserRow[]>('/v1/bonus/recipients'),
  bonusHistory: (opts: { userId?: string; from?: string; to?: string } = {}) => {
    const q = new URLSearchParams();
    if (opts.userId) q.set('userId', opts.userId);
    if (opts.from) q.set('from', opts.from);
    if (opts.to) q.set('to', opts.to);
    const qs = q.toString();
    return request<BonusAwardRow[]>(`/v1/bonus/history${qs ? `?${qs}` : ''}`);
  },
  bonusUserCard: (id: string) => request<BonusUserCard>(`/v1/bonus/users/${id}`),
  bonusAward: (body: { userId: string; ruleId?: string; points?: number; reason?: string }) =>
    request<{ award: BonusAwardRow; balance: number }>('/v1/bonus/award', { method: 'POST', body }),
  bonusCreateRule: (body: { name: string; points: number; roleKey?: string; active?: boolean; order?: number }) =>
    request<BonusRule>('/v1/bonus/rules', { method: 'POST', body }),
  bonusUpdateRule: (id: string, body: { name?: string; points?: number; roleKey?: string; active?: boolean; order?: number }) =>
    request<BonusRule>(`/v1/bonus/rules/${id}`, { method: 'PATCH', body }),
  bonusDeleteRule: (id: string) => request<{ ok: boolean }>(`/v1/bonus/rules/${id}`, { method: 'DELETE' }),
};

// ─── Бонусная программа сотрудников (§7) ───
export interface BonusUserRow {
  id: string;
  name: string;
  avatarUrl: string | null;
  roleKey: string | null;
  positionName: string | null;
}
export interface BonusLeaderRow extends BonusUserRow {
  points: number;
  rank: number;
}
export interface BonusRule {
  id: string;
  tenantId: string;
  name: string;
  points: number;
  roleKey: string | null;
  active: boolean;
  order: number;
  createdAt: string;
}
export interface BonusAwardRow {
  id: string;
  points: number;
  reason: string | null;
  createdAt: string;
  rule: { id: string; name: string } | null;
  user: { id: string; name: string | null; email: string; avatarUrl: string | null };
  awardedBy: { id: string; name: string | null; email: string } | null;
}
export interface BonusOverview {
  balance: number;
  monthPoints: number;
  rank: number | null;
  totalPeople: number;
  history: BonusAwardRow[];
  rules: BonusRule[];
  top: BonusLeaderRow[];
}
export interface BonusUserCard {
  user: BonusUserRow;
  balance: number;
  monthPoints: number;
  rank: number | null;
  history: BonusAwardRow[];
}

// ─── Типы ACL и групп ───
export type AclResourceType = 'kb_base' | 'kb_page' | 'drive_node' | 'secret';
export type AclLevelKey = 'VIEWER' | 'EDITOR' | 'MANAGER';
export interface AclEntryInput {
  subjectType: 'user' | 'role' | 'group';
  subjectId: string;
  level: AclLevelKey;
}
export interface AclEntryRow extends AclEntryInput {
  id: string;
  createdAt: string;
}
export interface AclSubjectsCatalog {
  users: { id: string; name: string | null; email: string }[];
  roles: { key: string; name: string }[];
  groups: { id: string; name: string }[];
}
export interface UserGroupRow {
  id: string;
  name: string;
  color: string;
  headUserId: string | null;
  parentId: string | null;
  memberIds: string[];
}

// ─── Типы Диска и публичных ссылок ───
export interface DriveNodeRow {
  id: string;
  parentId: string | null;
  kind: 'FOLDER' | 'FILE';
  name: string;
  shortId: string;
  mime: string | null;
  size: number | null;
  sha256: string | null;
  currentVersion: number;
  ownerId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface DriveVersionRow {
  id: string;
  n: number;
  size: number;
  mime: string;
  sha256: string;
  authorId: string | null;
  createdAt: string;
}
export interface PublicLinkRow {
  id: string;
  resourceType: 'kb_page' | 'drive_file';
  resourceId: string;
  token: string;
  expiresAt: string | null;
  revokedAt: string | null;
  openCount: number;
  createdAt: string;
}

// ─── Типы Базы знаний ───
export interface KbBlock {
  type: 'heading' | 'text' | 'image' | 'video' | 'button' | 'divider' | 'mindmap' | 'raw';
  level?: 2 | 3;
  text?: string;
  html?: string;
  src?: string;
  source?: string;
  href?: string;
  alt?: string;
  /** Эмбед ментальной карты: DriveNode.id файла .dmap. */
  fileId?: string;
  name?: string;
  note?: string;
}
export interface KbBaseRow {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  sortOrder: number;
  _count: { pages: number };
}
export interface KbPageNode {
  id: string;
  baseId: string;
  parentId: string | null;
  title: string;
  slug: string;
  shortId: string;
  icon: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  sortOrder: number;
  externalId: string | null;
  updatedAt: string;
}
export interface KbPageDetail extends KbPageNode {
  content: { blocks: KbBlock[] };
  tags: string[];
  guestAgentVisible: boolean;
  base: { id: string; name: string; slug: string };
  /** Детектор секретов (§8): похоже, на странице пароль — перенести в «Секреты». */
  secretWarning?: boolean;
}
export interface KbVersionRow {
  id: string;
  n: number;
  title: string;
  authorId: string | null;
  aiAssisted: boolean;
  createdAt: string;
}
export interface KbSearchHit {
  id: string;
  baseId: string;
  title: string;
  shortId: string;
  snippet: string;
  rank: number;
}
export interface KbAskResult {
  answer: string;
  sources: { n: number; pageId: string; title: string; shortId: string }[];
  noAnswer: boolean;
  model: string;
}
export interface KbImportTreeNode {
  externalId: string;
  title: string;
  exists: boolean;
  children: KbImportTreeNode[];
}
export interface KbImportReport {
  baseName: string;
  baseSlug: string;
  pagesTotal: number;
  pagesNew: number;
  pagesExisting: number;
  assetsUsed: number;
  assetsMissing: number;
  images: number;
  videos: number;
  unresolvedLinks: number;
  needsReview: { title: string; details: string[] }[];
  tree: KbImportTreeNode[];
}
export interface KbImportResult {
  jobId: string;
  created: number;
  updated: number;
  skipped: number;
  assetsCopied: number;
  needsReview: { pageId: string; title: string; details: string[] }[];
}
export interface KbImportJobRow {
  id: string;
  type: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  mode: string;
  report: KbImportResult | null;
  error: string | null;
  createdAt: string;
}

// ─── Типы Секретов (KB-DRIVE-TZ.md §8) ───
export interface SecretInput {
  name?: string;
  login?: string | null;
  url?: string | null;
  comment?: string | null;
  tags?: string[];
  password?: string;
  responsibleId?: string | null;
}
export interface SecretRow {
  id: string;
  name: string;
  login: string | null;
  url: string | null;
  comment: string | null;
  tags: string[];
  responsibleId: string | null;
  rotatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { views: number; tasks: number };
}
export interface SecretViewRow {
  id: string;
  userId: string;
  userName: string;
  at: string;
}
export interface SecretTaskRow {
  id: string;
  status: 'OPEN' | 'DONE' | 'DISMISSED';
  reason: string;
  createdAt: string;
  closedAt: string | null;
  secret: { id: string; name: string; login: string | null; url: string | null };
  offboardedUser: string | null;
  assignee: string | null;
  assigneeId: string | null;
}

/** Строка экрана аудита публичных ссылок (§5.4). */
export interface ActivePublicLinkRow extends PublicLinkRow {
  resourceName: string;
  resourceShortId: string | null;
  resourceDeleted: boolean;
}
