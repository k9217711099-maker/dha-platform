import { Controller, type MessageEvent, Query, Sse, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable, interval, map, merge } from 'rxjs';
import type { AdminJwtPayload } from '../../admin/admin-auth.service.js';
import { InboxEvents } from './inbox.events.js';

/**
 * SSE-поток событий ленты эскалаций (#1) — realtime-бейдж непрочитанных без опроса.
 * EventSource не шлёт заголовки → авторизация через `?token=<admin JWT>` (проверяем typ
 * и право guest_inbox). Путь `ai/inbox-events` (не под `ai/inbox/:id`, чтобы не конфликтовать
 * с GET :id). Каждые 25 c — ping, чтобы прокси не рвали простаивающее соединение.
 */
@ApiTags('ai')
@Controller('ai')
export class InboxStreamController {
  constructor(
    private readonly events: InboxEvents,
    private readonly jwt: JwtService,
  ) {}

  @Sse('inbox-events')
  @ApiOperation({ summary: 'SSE-поток изменений ленты эскалаций (realtime); авторизация — ?token=' })
  stream(@Query('token') token?: string): Observable<MessageEvent> {
    let payload: AdminJwtPayload;
    try {
      payload = this.jwt.verify<AdminJwtPayload>(token ?? '');
    } catch {
      throw new UnauthorizedException('Недействительный токен');
    }
    if (payload.typ !== 'admin' || !payload.perms?.includes('guest_inbox')) {
      throw new UnauthorizedException('Нет доступа к ленте эскалаций');
    }
    const events$ = this.events.stream().pipe(map((data) => ({ data }) as MessageEvent));
    const heartbeat$ = interval(25_000).pipe(map(() => ({ data: { kind: 'ping' } }) as MessageEvent));
    return merge(events$, heartbeat$);
  }
}
