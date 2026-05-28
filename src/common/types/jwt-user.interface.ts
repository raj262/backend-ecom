import { UserRole } from './user-role.enum';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** Session id — bound to a single device. Issued at login, rotated on refresh. */
  sid?: string;
}

export interface JwtUser extends JwtPayload {
  // For refresh strategy we also surface the raw refresh token, so the
  // service can compare its hash against the one persisted on the session.
  refreshToken?: string;
}
