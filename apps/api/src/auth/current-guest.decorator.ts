import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthedRequest } from './jwt-auth.guard.js';

/** Параметр-декоратор: ID текущего аутентифицированного гостя. */
export const CurrentGuestId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().guestId;
});
