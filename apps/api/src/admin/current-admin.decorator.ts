import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AdminRequest } from './admin-auth.guard.js';

/** ID текущего администратора. */
export const CurrentAdminId = createParamDecorator((_d: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<AdminRequest>().adminId;
});

/** Права текущего администратора (для гейтинга данных, напр. закупочных цен). */
export const CurrentAdminPerms = createParamDecorator((_d: unknown, ctx: ExecutionContext): string[] => {
  return ctx.switchToHttp().getRequest<AdminRequest>().adminPerms ?? [];
});
