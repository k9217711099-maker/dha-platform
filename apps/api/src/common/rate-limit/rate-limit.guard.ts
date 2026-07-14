import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export interface RateLimitOptions {
  /** Максимум запросов в окне. */
  limit: number;
  /** Ширина окна в миллисекундах. */
  windowMs: number;
}

export const RATE_LIMIT_KEY = 'rate_limit';

/**
 * Пометить эндпоинт лимитом запросов на клиента (по IP).
 * Пример: `@RateLimit({ limit: 20, windowMs: 60_000 })`.
 */
export const RateLimit = (opts: RateLimitOptions) => SetMetadata(RATE_LIMIT_KEY, opts);

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Простой in-memory rate-limit (скользящее фиксированное окно) для публичных
 * эндпоинтов без внешних зависимостей: анти-флуд, защита дорогих операций (LLM),
 * базовый заслон перебору. Хранит счётчики в памяти процесса — достаточно для
 * одного инстанса; при горизонтальном масштабировании заменить на Redis-хранилище.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();
  private lastSweep = Date.now();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const opts = this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!opts) return true; // без декоратора — не ограничиваем

    const req = context.switchToHttp().getRequest<Request>();
    const ip = this.clientIp(req);
    const routeKey = `${req.method}:${req.route?.path ?? req.path}:${ip}`;
    const now = Date.now();
    this.sweep(now);

    const bucket = this.buckets.get(routeKey);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(routeKey, { count: 1, resetAt: now + opts.windowMs });
      return true;
    }
    if (bucket.count >= opts.limit) {
      const retry = Math.ceil((bucket.resetAt - now) / 1000);
      throw new HttpException(
        `Слишком много запросов. Повторите через ${retry} с.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    bucket.count += 1;
    return true;
  }

  private clientIp(req: Request): string {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length) return (fwd.split(',')[0] ?? '').trim() || 'unknown';
    return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  }

  /** Периодически чистим протухшие корзины, чтобы Map не рос бесконечно. */
  private sweep(now: number): void {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    for (const [key, b] of this.buckets) {
      if (b.resetAt <= now) this.buckets.delete(key);
    }
  }
}
