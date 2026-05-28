import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { PassportModule } from '@nestjs/passport';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { OtpService } from './otp.service';
import { Otp, OtpSchema } from './schemas/otp.schema';
import { Session, SessionSchema } from './schemas/session.schema';
import { SessionsService } from './sessions.service';
import { JwtRefreshStrategy } from './strategies/jwt-refresh.strategy';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    UsersModule,
    NotificationsModule,
    PassportModule,
    // Secrets/TTLs are passed per-call from AuthService so we can sign with
    // different secrets for access vs refresh tokens.
    JwtModule.register({}),
    MongooseModule.forFeature([
      { name: Session.name, schema: SessionSchema },
      { name: Otp.name, schema: OtpSchema },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionsService,
    OtpService,
    OAuthService,
    JwtStrategy,
    JwtRefreshStrategy,
  ],
  exports: [AuthService, SessionsService],
})
export class AuthModule {}
