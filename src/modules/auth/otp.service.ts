import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Model } from 'mongoose';
import { NotificationDispatcherService } from '../notifications/dispatchers/notification-dispatcher.service';
import { Otp, OtpDocument, OtpPurpose } from './schemas/otp.schema';

const TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 60 * 1000;

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    @InjectModel(Otp.name) private readonly otpModel: Model<OtpDocument>,
    private readonly notifications: NotificationDispatcherService,
  ) {}

  /**
   * Generate a fresh 6-digit code, store its hash, and dispatch it
   * via SMS (or email, depending on `purpose`). Rate-limited to one
   * request per identifier per 60 s.
   *
   * Returns `{ ttlSeconds, devCode? }` — `devCode` is only populated
   * when no SMS provider is configured, so the dev/staging environment
   * can still log in.
   */
  async request(
    identifier: string,
    purpose: OtpPurpose,
  ): Promise<{ ttlSeconds: number; devCode?: string }> {
    const id = normalize(identifier, purpose);

    // Rate-limit recent requests.
    const existing = await this.otpModel
      .findOne({ identifier: id, purpose })
      .sort({ createdAt: -1 })
      .exec();
    if (existing) {
      const ageMs = Date.now() - (existing.get('createdAt') as Date).getTime();
      if (ageMs < RESEND_COOLDOWN_MS && !existing.consumedAt) {
        // Surface as a 429-style error.
        throw new BadRequestException(
          `Please wait ${Math.ceil((RESEND_COOLDOWN_MS - ageMs) / 1000)}s before requesting a new code`,
        );
      }
    }

    // Generate + persist.
    const code = generateCode();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + TTL_MS);
    await this.otpModel.create({
      identifier: id,
      purpose,
      codeHash,
      expiresAt,
      attempts: 0,
    });

    // Dispatch. The dispatcher itself no-ops when no provider is
    // configured so the dev story stays smooth.
    if (purpose === OtpPurpose.PHONE_LOGIN) {
      await this.notifications.sendSms({
        to: id,
        body: `Your Lumière verification code is ${code}. It expires in 5 minutes.`,
      });
    } else if (
      purpose === OtpPurpose.EMAIL_VERIFY ||
      purpose === OtpPurpose.PASSWORD_RESET
    ) {
      const subject =
        purpose === OtpPurpose.PASSWORD_RESET
          ? 'Reset your Lumière password'
          : 'Your Lumière verification code';
      const intro =
        purpose === OtpPurpose.PASSWORD_RESET
          ? 'Use this code to reset your password in the Lumière app'
          : 'Your verification code is';
      await this.notifications.sendEmail({
        to: id,
        subject,
        html: `<p>${intro}: <strong>${code}</strong>. It expires in 5 minutes.</p>`,
        text: `${intro}: ${code}. It expires in 5 minutes.`,
      });
    }

    const devMode =
      process.env.NODE_ENV !== 'production' &&
      (process.env.OTP_LOG_CODES === 'true' || !process.env.OTP_LOG_CODES);

    if (devMode) {
      this.logger.log(`[OTP ${purpose} → ${id}] code=${code}`);
    }

    return {
      ttlSeconds: Math.floor(TTL_MS / 1000),
      devCode: devMode ? code : undefined,
    };
  }

  /**
   * Verify the supplied code. Consumes (marks) the OTP on success.
   * Throws on bad code / expired / too-many-attempts.
   */
  async verify(
    identifier: string,
    purpose: OtpPurpose,
    code: string,
  ): Promise<void> {
    const id = normalize(identifier, purpose);
    const doc = await this.otpModel
      .findOne({ identifier: id, purpose, consumedAt: null })
      .sort({ createdAt: -1 })
      .exec();
    if (!doc) throw new BadRequestException('No verification code on file');

    if (doc.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Code expired — request a new one');
    }
    if (doc.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException('Too many attempts — request a new code');
    }

    const ok = await bcrypt.compare(code.trim(), doc.codeHash);
    if (!ok) {
      doc.attempts += 1;
      await doc.save();
      throw new BadRequestException('Incorrect code');
    }

    doc.consumedAt = new Date();
    await doc.save();
  }
}

function generateCode(): string {
  // 6-digit, zero-padded. crypto.randomInt avoids the Math.random bias.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function normalize(value: string, purpose: OtpPurpose): string {
  const trimmed = value.trim();
  if (purpose === OtpPurpose.PHONE_LOGIN) {
    // Strip everything except digits and a leading +. E.164 stays.
    const stripped = trimmed.replace(/[^\d+]/g, '');
    if (!stripped.startsWith('+') || stripped.length < 8) {
      throw new BadRequestException('Phone must be in E.164 format (+91…)');
    }
    return stripped;
  }
  return trimmed.toLowerCase();
}
