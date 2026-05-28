import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtUser } from '../types/jwt-user.interface';

/**
 * Injects the authenticated user payload (set by JwtStrategy.validate)
 * into a controller handler.
 *
 * @example
 *   @Get('me')
 *   me(@CurrentUser() user: JwtUser) { return user; }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser => {
    const req = ctx.switchToHttp().getRequest();
    return req.user as JwtUser;
  },
);
