import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DeviceTokenDocument = HydratedDocument<DeviceToken>;

export enum DevicePlatform {
  IOS = 'ios',
  ANDROID = 'android',
  WEB = 'web',
}

/**
 * Stores an Expo push token (`ExponentPushToken[…]`) per user device.
 *
 * A user can have many devices, but a given Expo token belongs to at
 * most one user — the registration endpoint upserts on `token` so a
 * phone that's been signed in by two different users routes pushes to
 * whichever user "owns" the device most recently. This matches what
 * users intuitively expect when they hand someone their phone to log
 * into their account.
 */
@Schema({ timestamps: true, versionKey: false })
export class DeviceToken {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  /** Stable per-install identifier from the client. */
  @Prop({ required: true, index: true })
  deviceId!: string;

  /** Raw Expo push token. */
  @Prop({ required: true, unique: true })
  token!: string;

  @Prop({
    type: String,
    enum: Object.values(DevicePlatform),
    required: true,
  })
  platform!: DevicePlatform;

  /** Friendly label (e.g. "iPhone 15 Pro"). */
  @Prop() deviceModel?: string;
  @Prop() osVersion?: string;
  @Prop() appVersion?: string;

  /** Soft-disable when Expo reports `DeviceNotRegistered`. */
  @Prop({ default: true }) enabled!: boolean;

  @Prop({ type: Date, default: () => new Date() }) lastSeenAt!: Date;
  @Prop({ type: Date }) disabledAt?: Date;
}

export const DeviceTokenSchema = SchemaFactory.createForClass(DeviceToken);
DeviceTokenSchema.index({ userId: 1, enabled: 1 });
