import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { JwtPayload } from '../../common/types/jwt-user.interface';
import { UserRole } from '../../common/types/user-role.enum';
import { UserDocument } from '../users/schemas/user.schema';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { OtpService } from './otp.service';
import { OtpPurpose } from './schemas/otp.schema';
import { DeviceInfo, SessionsService } from './sessions.service';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: ReturnType<UsersService['toPublic']>;
  sessionId: string;
}

export type AuthMethod = 'password' | 'phone-otp' | 'google' | 'apple';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly otp: OtpService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * `ConfigService.get<number>(...)` does NOT coerce — env values come out as
   * strings. Passing a string to `bcrypt.hash` makes bcrypt treat it as a salt
   * (e.g. `"10"`) and throw `Invalid salt version: 10`. Coerce here.
   */
  private get saltRounds(): number {
    const raw = this.config.get<string>('BCRYPT_SALT_ROUNDS');
    const parsed = raw ? Number.parseInt(raw, 10) : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
  }

  // ------------------------------------------------------------------
  // Email + password
  // ------------------------------------------------------------------

  async register(dto: RegisterDto, device: DeviceInfo): Promise<AuthResponse> {
    const existing = await this.users.findByEmailWithSecrets(dto.email);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, this.saltRounds);
    const user = await this.users.create({
      name: dto.name,
      email: dto.email.toLowerCase(),
      passwordHash,
      role: UserRole.CUSTOMER,
    });

    return this.buildAuthResponse(user, device, 'password');
  }

  /**
   * Always returns a generic success shape — never reveals whether the
   * email is registered (enumeration-safe).
   */
  async requestPasswordReset(email: string) {
    const normalized = email.trim().toLowerCase();
    const user = await this.users.findByEmailWithSecrets(normalized);

    let payload: { ttlSeconds: number; devCode?: string } = {
      ttlSeconds: 300,
    };

    if (user?.passwordHash) {
      payload = await this.otp.request(normalized, OtpPurpose.PASSWORD_RESET);
    }

    return {
      message:
        'If an account exists for this email, we sent password reset instructions.',
      ttlSeconds: payload.ttlSeconds,
      devCode: payload.devCode,
    };
  }

  async login(dto: LoginDto, device: DeviceInfo): Promise<AuthResponse> {
    const user = await this.users.findByEmailWithSecrets(dto.email);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid email or password');

    return this.buildAuthResponse(user, device, 'password');
  }

  // ------------------------------------------------------------------
  // Phone OTP
  // ------------------------------------------------------------------

  async requestPhoneOtp(phone: string) {
    return this.otp.request(phone, OtpPurpose.PHONE_LOGIN);
  }

  async verifyPhoneOtp(
    phone: string,
    code: string,
    device: DeviceInfo,
  ): Promise<AuthResponse> {
    await this.otp.verify(phone, OtpPurpose.PHONE_LOGIN, code);

    const normalized = phone.trim().replace(/[^\d+]/g, '');
    const existing = await this.users.findByPhoneWithSecrets(normalized);

    let user: UserDocument;
    if (existing) {
      user = existing;
      if (!existing.phoneVerified) {
        await this.users.markPhoneVerified(existing._id.toString(), normalized);
        existing.phoneVerified = true;
      }
    } else {
      // Phone-first sign-up: create a stub account. The user can fill
      // in name/email later from the profile screen.
      const placeholderEmail = `${normalized.replace(/[^\d]/g, '')}@phone.lumiere.local`;
      user = await this.users.create({
        name: 'New customer',
        email: placeholderEmail,
        phone: normalized,
        phoneVerified: true,
        role: UserRole.CUSTOMER,
      });
    }

    return this.buildAuthResponse(user, device, 'phone-otp');
  }

  // ------------------------------------------------------------------
  // OAuth — invoked by OAuthService after it verifies an ID token
  // ------------------------------------------------------------------

  async loginWithOAuth(input: {
    provider: 'google' | 'apple';
    providerId: string;
    email: string | null;
    name: string | null;
    avatarUrl?: string;
    device: DeviceInfo;
  }): Promise<AuthResponse> {
    const field = input.provider === 'google' ? 'googleId' : 'appleId';

    // 1. Existing OAuth login → straight through.
    const byProvider =
      input.provider === 'google'
        ? await this.users.findByGoogleId(input.providerId)
        : await this.users.findByAppleId(input.providerId);
    if (byProvider) {
      return this.buildAuthResponse(byProvider, input.device, input.provider);
    }

    // 2. User may already exist with the same email — link the
    //    provider so we don't create a duplicate account.
    if (input.email) {
      const byEmail = await this.users.findByEmail(input.email);
      if (byEmail) {
        await this.users.linkProviderId(
          byEmail._id.toString(),
          field,
          input.providerId,
        );
        byEmail[field] = input.providerId;
        return this.buildAuthResponse(byEmail, input.device, input.provider);
      }
    }

    // 3. First-time OAuth user → create the account.
    if (!input.email) {
      // Apple's "private relay" can withhold email on subsequent logins
      // but we always see it the first time. If we somehow get here
      // without one, refuse to silently invent a placeholder.
      throw new BadRequestException('OAuth provider did not return an email');
    }
    const created = await this.users.create({
      name: input.name || 'New customer',
      email: input.email.toLowerCase(),
      emailVerified: true,
      avatarUrl: input.avatarUrl,
      role: UserRole.CUSTOMER,
      [field]: input.providerId,
    });
    return this.buildAuthResponse(created, input.device, input.provider);
  }

  // ------------------------------------------------------------------
  // Refresh + logout
  // ------------------------------------------------------------------

  async refresh(
    userId: string,
    sessionId: string,
    presentedRefreshToken: string,
  ): Promise<AuthTokens & { sessionId: string }> {
    const session = await this.sessions.findActiveWithRefreshCheck(
      sessionId,
      presentedRefreshToken,
    );
    if (session.userId.toString() !== userId) {
      throw new ForbiddenException('Session does not belong to user');
    }
    const user = await this.users.findById(userId);
    if (!user) throw new ForbiddenException('User not found');

    const tokens = await this.signTokens(user, sessionId);
    await this.sessions.rotateRefreshToken(sessionId, tokens.refreshToken, this.saltRounds);
    return { ...tokens, sessionId };
  }

  async logout(sessionId?: string): Promise<void> {
    if (!sessionId) return;
    await this.sessions.revoke(sessionId);
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private async buildAuthResponse(
    user: UserDocument,
    device: DeviceInfo,
    method: AuthMethod,
  ): Promise<AuthResponse> {
    // 1. Sign an "intent" pair without sid first so we have a refresh
    //    token to store on the new session row.
    const tempSessionId = ''; // not yet known
    const ephemeral = await this.signTokens(user, tempSessionId);

    // 2. Upsert the session row with the bcrypt of that refresh token.
    const session = await this.sessions.upsertOnLogin(
      user._id.toString(),
      ephemeral.refreshToken,
      device,
      method,
      this.saltRounds,
    );

    // 3. Re-sign so the final tokens carry `sid` (lets the refresh
    //    endpoint find the session row in O(1) and rotate it).
    const final = await this.signTokens(user, session._id.toString());
    await this.sessions.rotateRefreshToken(
      session._id.toString(),
      final.refreshToken,
      this.saltRounds,
    );

    return {
      ...final,
      sessionId: session._id.toString(),
      user: this.users.toPublic(user),
    };
  }

  private async signTokens(
    user: UserDocument,
    sessionId: string,
  ): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
      sid: sessionId || undefined,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m'),
      }),
      this.jwt.signAsync(payload, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_TTL', '30d'),
      }),
    ]);
    return { accessToken, refreshToken };
  }
}
