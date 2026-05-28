import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route handler as public, bypassing the global JWT guard.
 *
 * @example
 *   @Public()
 *   @Get('health')
 *   health() { return { ok: true }; }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
