import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type OtpDocument = HydratedDocument<Otp>;

export enum OtpPurpose {
  PHONE_LOGIN = 'phone-login',
  EMAIL_VERIFY = 'email-verify',
  PASSWORD_RESET = 'password-reset',
}

/**
 * Short-lived (5 min) one-time codes. We store only the bcrypt hash
 * of the code so a DB dump can't be replayed. The TTL index on
 * `expiresAt` auto-deletes consumed/expired rows.
 */
@Schema({ timestamps: true, versionKey: false })
export class Otp {
  /** E.164 phone (`+919876543210`) or lowercase email address. */
  @Prop({ required: true, index: true })
  identifier!: string;

  @Prop({
    type: String,
    enum: Object.values(OtpPurpose),
    required: true,
    index: true,
  })
  purpose!: OtpPurpose;

  @Prop({ required: true })
  codeHash!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop({ default: 0 })
  attempts!: number;

  @Prop({ type: Date, default: null })
  consumedAt?: Date | null;
}

export const OtpSchema = SchemaFactory.createForClass(Otp);

// Auto-cleanup expired/consumed codes 60 seconds after they expire so
// the rate-limit window stays honest until the doc disappears.
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 });
