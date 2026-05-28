import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type SessionDocument = HydratedDocument<Session>;

/**
 * One row per (user, device, login). Refresh tokens are bound to a
 * session so we can:
 *   - rotate / invalidate one device without affecting others
 *   - render a "logged-in devices" list with a revoke button
 *   - record which sign-in method created the session for audits
 *
 * The compound index on `(userId, deviceId)` keeps logins idempotent
 * across re-logins from the same device — the latest login just
 * rotates the hash on the existing session row.
 */
@Schema({ timestamps: true, versionKey: false })
export class Session {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  /**
   * Stable per-device identifier supplied by the client (a UUID kept
   * in secure storage). Never trusted as an identity, only as a
   * grouping key for "this is the same install of the app".
   */
  @Prop({ required: true, index: true })
  deviceId!: string;

  /**
   * Human-friendly device label shown on the sessions screen — e.g.
   * "Pixel 8 (Android 14)" or "iPhone 15 Pro · Safari".
   */
  @Prop({ default: '' })
  deviceName!: string;

  /** "ios" | "android" | "web" | "unknown" */
  @Prop({ default: 'unknown', index: true })
  platform!: string;

  @Prop({ default: '' })
  userAgent!: string;

  @Prop({ default: '' })
  ip!: string;

  /** "password" | "phone-otp" | "google" | "apple" */
  @Prop({ default: 'password' })
  authMethod!: string;

  /**
   * Hash of the most recently issued refresh token for this session.
   * Cleared when the session is revoked. `select: false` so it never
   * leaks through the list endpoint.
   */
  @Prop({ type: String, default: null, select: false })
  refreshTokenHash!: string | null;

  @Prop({ default: () => new Date() })
  lastSeenAt!: Date;

  @Prop({ type: Date, default: null })
  revokedAt?: Date | null;
}

export const SessionSchema = SchemaFactory.createForClass(Session);

// (user, device) is the natural key — one logical session per device.
SessionSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
// Quick lookup of all active sessions for a user.
SessionSchema.index({ userId: 1, revokedAt: 1, lastSeenAt: -1 });
