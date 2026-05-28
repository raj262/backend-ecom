import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtUser } from '../types/jwt-user.interface';
import { UserRole } from '../types/user-role.enum';

/**
 * Global role middleware. Runs after JwtAuthGuard (which populates `req.user`).
 *
 *  - `@Public()`           → bypass entirely.
 *  - No `@Roles(...)`      → allow any authenticated user.
 *  - `@Roles(a, b, ...)`   → user must have one of the listed roles.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest().user as JwtUser | undefined;
    if (!user) throw new ForbiddenException('Not authenticated');

    if (!required.includes(user.role)) {
      throw new ForbiddenException(
        `Requires role: ${required.join(' or ')} (you are ${user.role})`,
      );
    }
    return true;
  }
}
