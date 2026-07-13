import { SetMetadata } from '@nestjs/common';

export const PERM_KEY = 'required_permission';

/** Пометить эндпоинт правом доступа (проверяется AdminAuthGuard). */
export const RequirePermission = (perm: string) => SetMetadata(PERM_KEY, perm);
