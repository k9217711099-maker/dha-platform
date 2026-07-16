import { Injectable, Logger } from '@nestjs/common';
import { AVITO_API_BASE, AvitoBooking, AvitoCredentials, AvitoItem, AvitoTokenResponse } from './avito.types.js';

interface CachedToken {
  accessToken: string;
  /** epoch ms истечения (с запасом). */
  expiresAt: number;
}

/**
 * Тонкий HTTP-клиент Avito. Кэширует OAuth-токен (client_credentials, ~24ч) по clientId,
 * обновляет по истечении/при 401. Не хранит состояние по каналу — контекст передаётся в вызовах.
 *
 * ВАЖНО: avito_booking_id — целое > 2^53, поэтому ответы броней парсим с сохранением этого
 * поля строкой (JSON.parse иначе теряет точность).
 */
@Injectable()
export class AvitoHttpClient {
  private readonly logger = new Logger(AvitoHttpClient.name);
  private readonly tokens = new Map<string, CachedToken>();
  /** Запас до фактического истечения, чтобы не словить 401 на границе. */
  private static readonly EXPIRY_SKEW_MS = 60_000;

  /** Получить (из кэша или заново) access-token по учётным данным. */
  async getToken(creds: Pick<AvitoCredentials, 'clientId' | 'clientSecret'>, forceRefresh = false): Promise<string> {
    const cached = this.tokens.get(creds.clientId);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.accessToken;

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    });
    const res = await fetch(`${AVITO_API_BASE}/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`avito_auth_failed:${res.status}:${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as AvitoTokenResponse;
    const token: CachedToken = {
      accessToken: json.access_token,
      expiresAt: Date.now() + json.expires_in * 1000 - AvitoHttpClient.EXPIRY_SKEW_MS,
    };
    this.tokens.set(creds.clientId, token);
    return token.accessToken;
  }

  /**
   * Брони объявления за окно дат. date_start обязан быть сегодня или в будущем (Avito 422),
   * поэтому окно нормализуется вызывающей стороной. Возвращает как есть (в т.ч. active/canceled).
   */
  async getBookings(creds: AvitoCredentials, itemId: string, dateStart: string, dateEnd: string): Promise<AvitoBooking[]> {
    const path = `/realty/v1/accounts/${creds.userId}/items/${itemId}/bookings?date_start=${dateStart}&date_end=${dateEnd}`;
    const parsed = await this.authedGetJson(creds, path);
    const bookings = (parsed as { bookings?: unknown }).bookings;
    return Array.isArray(bookings) ? (bookings as AvitoBooking[]) : [];
  }

  /** Данные аккаунта (self) — для проверки связи и получения userId. */
  async getSelf(creds: Pick<AvitoCredentials, 'clientId' | 'clientSecret'>): Promise<{ id: number; name?: string; email?: string }> {
    const token = await this.getToken(creds);
    const res = await fetch(`${AVITO_API_BASE}/core/v1/accounts/self`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`avito_self_failed:${res.status}`);
    return (await res.json()) as { id: number; name?: string; email?: string };
  }

  /** Все объявления аккаунта (пагинация по 100) — для сопоставления item_id ↔ нашей категории. */
  async getItems(creds: Pick<AvitoCredentials, 'clientId' | 'clientSecret'>): Promise<AvitoItem[]> {
    const token = await this.getToken(creds);
    const items: AvitoItem[] = [];
    for (let page = 1; page <= 50; page++) {
      const res = await fetch(`${AVITO_API_BASE}/core/v1/items?per_page=100&page=${page}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`avito_items_failed:${res.status}`);
      const json = (await res.json()) as { resources?: AvitoItem[] };
      const batch = json.resources ?? [];
      items.push(...batch);
      if (batch.length < 100) break;
    }
    return items;
  }

  /**
   * GET с автоподстановкой токена и одним ретраем на 401 (протух токен → обновляем).
   * Ответ броней читаем как текст и «оквычиваем» avito_booking_id перед JSON.parse (big-int).
   */
  private async authedGetJson(creds: AvitoCredentials, path: string): Promise<unknown> {
    let token = await this.getToken(creds);
    let res = await fetch(`${AVITO_API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401) {
      token = await this.getToken(creds, true);
      res = await fetch(`${AVITO_API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    }
    const text = await res.text();
    if (!res.ok) throw new Error(`avito_get_failed:${res.status}:${text.slice(0, 200)}`);
    return JSON.parse(quoteBigIds(text));
  }
}

/**
 * Оборачивает в кавычки числовые значения полей *_id, чтобы 19-значные идентификаторы
 * (avito_booking_id) не потеряли точность при JSON.parse. Уже строковые значения не трогает.
 */
export function quoteBigIds(json: string): string {
  return json.replace(/("(?:\w*_)?id"\s*:\s*)(\d{16,})/g, '$1"$2"');
}
