import { Injectable, Logger, NotImplementedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BnovoPort } from './bnovo.port.js';
import { BnovoAuthService } from './bnovo-auth.service.js';
import type {
  BnovoAvailabilityQuery,
  BnovoBookingResult,
  BnovoCalendarDay,
  BnovoCalendarQuery,
  BnovoCreateBookingRequest,
  BnovoOffer,
  BnovoProperty,
  BnovoRatePlan,
  BnovoRoomType,
} from './bnovo.types.js';
import type { Env } from '../../config/env.schema.js';

// ─── Сырые типы ответов Bnovo ───
interface BnovoPlan {
  id: number;
  parent_id: number;
  name: string;
  has_child: boolean;
}
type AvailabilityResp = Record<string, { room_type_id: number; full_quantity: number; availability: Record<string, number> }>;
// Ответ цен: { prices: { room_type_id: { date: { price, is_default } } } }
interface PricesResp {
  prices: Record<string, Record<string, { price: number; is_default: boolean }>>;
}

const addDays = (d: string, n: number): string => {
  const dt = new Date(d + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
};
const nightsBetween = (from: string, to: string): string[] => {
  const out: string[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) out.push(d);
  return out;
};

/**
 * Реальный адаптер Bnovo PMS (Open API, тариф «Профессионал»). Read-интеграция:
 * доступность, цены/тарифы, типы номеров, чтение броней. Создание брони этим API
 * не поддерживается — нужен Channel Manager API (решение владельца 2026-06-29).
 */
@Injectable()
export class HttpBnovoAdapter extends BnovoPort {
  private readonly logger = new Logger(HttpBnovoAdapter.name);
  private readonly baseUrl: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly auth: BnovoAuthService,
  ) {
    super();
    this.baseUrl = config.get('BNOVO_API_BASE', { infer: true });
  }

  /** GET к Bnovo с bearer-токеном; одна переавторизация по 401. Возвращает поле data. */
  private async get<T>(path: string): Promise<T> {
    let token = await this.auth.getToken();
    let res = await fetch(`${this.baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      this.auth.invalidate();
      token = await this.auth.getToken(true);
      res = await fetch(`${this.baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new ServiceUnavailableException(`Bnovo GET ${path} → ${res.status}: ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as { data?: T } & T;
    return (json.data ?? json) as T;
  }

  // ─── Доступность + цены → офферы ───
  async getAvailability(query: BnovoAvailabilityQuery): Promise<BnovoOffer[]> {
    const nights = nightsBetween(query.checkIn, query.checkOut);
    if (!nights.length) return [];

    const avail = await this.get<AvailabilityResp>(
      `/api/v1/availability/roomtypes?date_from=${query.checkIn}&date_to=${query.checkOut}`,
    );
    const plans = await this.bookablePlans();
    const pricesByPlan = new Map<number, PricesResp>();
    for (const p of plans) {
      try {
        pricesByPlan.set(p.id, await this.get<PricesResp>(`/api/v1/tariffs/prices/${p.id}?date_from=${query.checkIn}&date_to=${query.checkOut}`));
      } catch {
        /* у тарифа может не быть цен на даты — пропускаем */
      }
    }

    const offers: BnovoOffer[] = [];
    for (const entry of Object.values(avail)) {
      const roomTypeId = String(entry.room_type_id);
      if (query.roomTypeId && roomTypeId !== query.roomTypeId) continue;
      const available = Math.min(...nights.map((d) => entry.availability[d] ?? 0));
      if (available <= 0) continue;

      const ratePlans: BnovoRatePlan[] = [];
      for (const p of plans) {
        const byRoom = pricesByPlan.get(p.id)?.prices?.[roomTypeId];
        if (!byRoom) continue;
        const nightly: number[] = [];
        let complete = true;
        for (const d of nights) {
          const price = byRoom[d]?.price;
          if (price == null) {
            complete = false;
            break;
          }
          nightly.push(Number(price));
        }
        if (!complete) continue;
        const total = nightly.reduce((s, n) => s + n, 0);
        ratePlans.push({
          id: String(p.id),
          name: p.name,
          totalPrice: Math.round(total),
          perNight: Math.round(total / nights.length),
          refundable: true,
          cancellationPolicy: 'По условиям тарифа',
        });
      }
      if (!ratePlans.length) continue;
      ratePlans.sort((a, b) => a.totalPrice - b.totalPrice);
      offers.push({ roomTypeId, available, nights: nights.length, minNights: 1, ratePlans });
    }
    return offers;
  }

  // ─── Календарь цен/доступности на диапазон ───
  async getPriceCalendar(query: BnovoCalendarQuery): Promise<BnovoCalendarDay[]> {
    const to = addDays(query.from, query.days);
    const avail = await this.get<AvailabilityResp>(`/api/v1/availability/roomtypes?date_from=${query.from}&date_to=${to}`);
    const plans = await this.bookablePlans();
    const pricesByPlan: PricesResp[] = [];
    for (const p of plans) {
      try {
        pricesByPlan.push(await this.get<PricesResp>(`/api/v1/tariffs/prices/${p.id}?date_from=${query.from}&date_to=${to}`));
      } catch {
        /* пропускаем */
      }
    }

    const roomTypes = Object.values(avail).filter((e) => !query.roomTypeId || String(e.room_type_id) === query.roomTypeId);
    const days: BnovoCalendarDay[] = [];
    for (let d = query.from; d < to; d = addDays(d, 1)) {
      const available = roomTypes.some((e) => (e.availability[d] ?? 0) > 0);
      let min: number | null = null;
      for (const e of roomTypes) {
        if ((e.availability[d] ?? 0) <= 0) continue;
        for (const pr of pricesByPlan) {
          const price = pr.prices?.[String(e.room_type_id)]?.[d]?.price;
          if (price != null && (min === null || price < min)) min = Math.round(Number(price));
        }
      }
      days.push({ date: d, available, minNightlyPrice: min });
    }
    return days;
  }

  // ─── Типы номеров (пагинация: limit ≤ 30) ───
  async listRoomTypes(_propertyId: string): Promise<BnovoRoomType[]> {
    const all: RawRoomType[] = [];
    for (let offset = 0; offset <= 2000; offset += 30) {
      const data = await this.get<{ room_types?: RawRoomType[]; meta?: { total?: number } }>(`/api/v1/roomtypes?limit=30&offset=${offset}`);
      const list = data.room_types ?? [];
      all.push(...list);
      if (list.length < 30 || all.length >= (data.meta?.total ?? all.length)) break;
    }
    return all.map((r) => ({
      id: String(r.id),
      propertyId: String(r.hotel_id ?? _propertyId),
      name: r.name ?? `Категория ${r.id}`,
      capacity: Number((r.adults ?? 0) + (r.children ?? 0)) || 2,
      description: r.description ?? undefined,
      amenities: [],
      photos: [],
    }));
  }

  // ─── Объект размещения (один аккаунт Bnovo = один отель) ───
  async listProperties(): Promise<BnovoProperty[]> {
    const me = await this.get<{ id: number }>(`/api/v1/auth/me`);
    return [
      {
        id: String(me.id),
        name: 'D Hotels & Apartments (Bnovo)',
        type: 'hotel',
        address: '',
        amenities: [],
        features: [],
        photos: [],
      },
    ];
  }

  async getBookingStatus(bnovoBookingId: string): Promise<string> {
    const b = await this.get<{ status?: { name?: string; id?: number } }>(`/api/v1/bookings/${bnovoBookingId}`);
    return b.status?.name ?? 'unknown';
  }

  // ─── Запись брони не поддерживается Open API (только Channel Manager) ───
  createBooking(_req: BnovoCreateBookingRequest): Promise<BnovoBookingResult> {
    throw new NotImplementedException(
      'Создание брони в Bnovo недоступно через Open API. Бронь создаётся в нашей системе; запись в Bnovo — через Channel Manager API (отдельный доступ).',
    );
  }

  cancelBooking(_bnovoBookingId: string): Promise<void> {
    throw new NotImplementedException('Отмена брони в Bnovo через Open API не реализована (Channel Manager API).');
  }

  /** Бронируемые тарифы: листовые планы (без детей); если нет — все. Капаем кол-во запросов цен. */
  private async bookablePlans(): Promise<BnovoPlan[]> {
    const { plans } = await this.get<{ plans: BnovoPlan[] }>(`/api/v1/tariffs`);
    const leaves = plans.filter((p) => !p.has_child);
    return (leaves.length ? leaves : plans).slice(0, 8);
  }
}

interface RawRoomType {
  id: number;
  hotel_id?: number;
  parent_id?: number;
  name?: string;
  adults?: number;
  children?: number;
  description?: string | null;
}
