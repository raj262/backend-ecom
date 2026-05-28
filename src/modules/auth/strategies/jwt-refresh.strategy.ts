import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload, JwtUser } from '../../../common/types/jwt-user.interface';

/**
 * Reads the refresh token from the Authorization header so a client can
 * call POST /auth/refresh with `Authorization: Bearer <refreshToken>`.
 *
 * The raw refresh token is attached to req.user.refreshToken so AuthService
 * can compare it against the hash stored on the user document.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(
  Strategy,
  'jwt-refresh',
) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_REFRESH_SECRET');
    if (!secret) throw new Error('JWT_REFRESH_SECRET is not configured');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<JwtUser> {
    if (!payload?.sub) throw new UnauthorizedException();
    const auth = req.headers.authorization ?? '';
    const refreshToken = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!refreshToken) throw new UnauthorizedException('Missing refresh token');

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      sid: payload.sid,
      refreshToken,
    };
  }
}
