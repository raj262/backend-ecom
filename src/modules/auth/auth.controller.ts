import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtRefreshGuard } from '../../common/guards/jwt-refresh.guard';
import { JwtUser } from '../../common/types/jwt-user.interface';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { DeviceInfoDto } from './dto/device-info.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { AppleSignInDto, GoogleSignInDto } from './dto/oauth.dto';
import { RegisterDto } from './dto/register.dto';
import {
  RequestPhoneOtpDto,
  VerifyPhoneOtpDto,
} from './dto/phone-otp.dto';
import { OAuthService } from './oauth.service';
import { DeviceInfo, SessionsService } from './sessions.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly users: UsersService,
    private readonly sessions: SessionsService,
    private readonly oauth: OAuthService,
  ) {}

  // ------------------------------------------------------------------
  // Email + password
  // ------------------------------------------------------------------

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, buildDeviceInfo(dto.device, req));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, buildDeviceInfo(dto.device, req));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  // ------------------------------------------------------------------
  // Phone OTP
  // ------------------------------------------------------------------

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('otp/request')
  requestOtp(@Body() dto: RequestPhoneOtpDto) {
    return this.auth.requestPhoneOtp(dto.phone);
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('otp/verify')
  verifyOtp(@Body() dto: VerifyPhoneOtpDto, @Req() req: Request) {
    return this.auth.verifyPhoneOtp(
      dto.phone,
      dto.code,
      buildDeviceInfo(dto.device, req),
    );
  }

  // ------------------------------------------------------------------
  // OAuth
  // ------------------------------------------------------------------

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('google')
  async google(@Body() dto: GoogleSignInDto, @Req() req: Request) {
    const verified = await this.oauth.verifyGoogleIdToken(dto.idToken);
    return this.auth.loginWithOAuth({
      provider: 'google',
      providerId: verified.providerId,
      email: verified.email,
      name: verified.name,
      avatarUrl: verified.avatarUrl,
      device: buildDeviceInfo(dto.device, req),
    });
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('apple')
  async apple(@Body() dto: AppleSignInDto, @Req() req: Request) {
    const verified = await this.oauth.verifyAppleIdToken(dto.idToken);
    return this.auth.loginWithOAuth({
      provider: 'apple',
      providerId: verified.providerId,
      email: verified.email,
      name: dto.fullName?.trim() || verified.name,
      device: buildDeviceInfo(dto.device, req),
    });
  }

  // ------------------------------------------------------------------
  // Refresh + logout + me
  // ------------------------------------------------------------------

  /**
   * Send the refresh token as `Authorization: Bearer <refreshToken>`.
   * Rotates the refresh token on every call and bumps `lastSeenAt` on
   * the session.
   */
  @Public()
  @UseGuards(JwtRefreshGuard)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@CurrentUser() user: JwtUser) {
    if (!user.sid) {
      // Legacy refresh tokens (pre-sessions) — force a fresh login.
      throw new ForbiddenException('Legacy session — please log in again');
    }
    return this.auth.refresh(user.sub, user.sid, user.refreshToken!);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(@CurrentUser() user: JwtUser) {
    await this.auth.logout(user.sid);
  }

  @Get('me')
  async me(@CurrentUser() jwtUser: JwtUser) {
    const user = await this.users.findById(jwtUser.sub);
    if (!user) throw new NotFoundException('User not found');
    return this.users.toPublic(user);
  }

  // ------------------------------------------------------------------
  // Sessions / Device management
  // ------------------------------------------------------------------

  @Get('sessions')
  async listSessions(@CurrentUser() user: JwtUser) {
    return this.sessions.listForUser(user.sub, user.sid);
  }

  /** Revoke a specific session ("log out of this device"). */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('sessions/:id')
  async revokeSession(
    @Param('id') id: string,
    @CurrentUser() user: JwtUser,
  ) {
    const owned = await this.sessions.getOwnedById(user.sub, id);
    await this.sessions.revoke(owned._id.toString());
  }

  /** Revoke every session except the current one. */
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('sessions')
  async revokeAllOtherSessions(@CurrentUser() user: JwtUser) {
    if (!user.sid) throw new BadRequestException('No active session');
    await this.sessions.revokeAllForUser(user.sub, user.sid);
  }
}

/**
 * Merge the client-supplied device meta with what we can sniff from
 * the request (IP, user-agent). Falls back to a stable `unknown-*`
 * deviceId so we always have something to keyword a session on.
 */
function buildDeviceInfo(input: DeviceInfoDto | undefined, req: Request): DeviceInfo {
  const ip =
    (typeof req.headers['x-forwarded-for'] === 'string'
      ? req.headers['x-forwarded-for'].split(',')[0].trim()
      : '') ||
    req.ip ||
    '';
  const userAgent =
    typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : '';
  return {
    deviceId: input?.deviceId?.trim() || `unknown-${ip || 'host'}-${userAgent.slice(0, 24)}`,
    deviceName: input?.deviceName,
    platform: input?.platform ?? sniffPlatform(userAgent),
    userAgent,
    ip,
  };
}

function sniffPlatform(ua: string): string {
  if (/iPhone|iPad|iOS/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (ua) return 'web';
  return 'unknown';
}
