import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { JwtPayload } from './tokens.service.js';

/** Запрос с идентификатором аутентифицированного гостя. */
export interface AuthedRequest extends Request {
  guestId: string;
}

/** Проверяет Bearer access-токен и кладёт guestId в запрос. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Отсутствует токен доступа');
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(header.slice(7));
      req.guestId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException('Недействительный токен доступа');
    }
  }
}
