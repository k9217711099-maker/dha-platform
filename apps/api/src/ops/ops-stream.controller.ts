import { Controller, type MessageEvent, Query, Sse, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable, interval, map, merge } from 'rxjs';
import type { AdminJwtPayload } from '../admin/admin-auth.service.js';
import { OpsEvents } from './ops.events.js';

/**
 * SSE-поток событий задач/уборок (§11) — по образцу staff-chat: EventSource не шлёт
 * заголовки, авторизация через ?token= (typ admin + право ops_tasks).
 */
@ApiTags('ops-tasks')
@Controller('v1/ops')
export class OpsStreamController {
  constructor(
    private readonly events: OpsEvents,
    private readonly jwt: JwtService,
  ) {}

  @Sse('stream')
  @ApiOperation({ summary: 'SSE-поток событий задач (realtime); авторизация — ?token=' })
  stream(@Query('token') token?: string): Observable<MessageEvent> {
    let payload: AdminJwtPayload;
    try {
      payload = this.jwt.verify<AdminJwtPayload>(token ?? '');
    } catch {
      throw new UnauthorizedException('Недействительный токен');
    }
    if (payload.typ !== 'admin' || !payload.perms?.includes('ops_tasks')) {
      throw new UnauthorizedException('Нет доступа к задачам');
    }
    const events$ = this.events.forUser(payload.sub).pipe(map((data) => ({ data }) as MessageEvent));
    const heartbeat$ = interval(25_000).pipe(map(() => ({ data: { kind: 'ping' } }) as MessageEvent));
    return merge(events$, heartbeat$);
  }
}
