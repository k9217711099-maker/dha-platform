import { Controller, type MessageEvent, Query, Sse, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable, interval, map, merge } from 'rxjs';
import type { AdminJwtPayload } from '../admin/admin-auth.service.js';
import { StaffChatEvents } from './staff-chat.events.js';
import { StaffChatService } from './staff-chat.service.js';

/**
 * SSE-поток событий мессенджера (§2) — realtime без WebSocket. EventSource не умеет
 * слать заголовки, поэтому авторизация — через `?token=<admin JWT>` (проверяем typ
 * и право staff_chat). Отдельный контроллер БЕЗ class-guard'а (тот читает header).
 * Presence привязан к жизненному циклу соединения (connect/disconnect). Каждые 25 c
 * шлём ping, чтобы прокси не рвали простаивающее соединение.
 */
@ApiTags('staff-chat')
@Controller('staff-chat')
export class StaffChatStreamController {
  constructor(
    private readonly events: StaffChatEvents,
    private readonly chat: StaffChatService,
    private readonly jwt: JwtService,
  ) {}

  @Sse('stream')
  @ApiOperation({ summary: 'SSE-поток событий чатов (realtime); авторизация — ?token=' })
  stream(@Query('token') token?: string): Observable<MessageEvent> {
    let payload: AdminJwtPayload;
    try {
      payload = this.jwt.verify<AdminJwtPayload>(token ?? '');
    } catch {
      throw new UnauthorizedException('Недействительный токен');
    }
    if (payload.typ !== 'admin' || !payload.perms?.includes('staff_chat')) {
      throw new UnauthorizedException('Нет доступа к мессенджеру');
    }
    const userId = payload.sub;
    const events$ = this.events.forUser(userId).pipe(map((data) => ({ data }) as MessageEvent));
    const heartbeat$ = interval(25_000).pipe(map(() => ({ data: { kind: 'ping' } }) as MessageEvent));
    const merged$ = merge(events$, heartbeat$);

    // presence: онлайн, пока соединение живо.
    return new Observable<MessageEvent>((subscriber) => {
      void this.chat.streamConnect(userId);
      const sub = merged$.subscribe(subscriber);
      return () => {
        sub.unsubscribe();
        this.chat.streamDisconnect(userId);
      };
    });
  }
}
