import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

/**
 * All the "integration slots" the platform exposes. Each slot can have
 * exactly one active provider (e.g. payment → razorpay OR easebuzz OR
 * stripe; mail → smtp OR sendgrid; …).
 *
 * Adding a new slot is a two-step: add a value here, add an entry to
 * `PROVIDER_CATALOG` in `provider-catalog.ts`.
 */
export enum IntegrationKey {
  PAYMENT = 'payment',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  MAIL = 'mail',
}

export enum IntegrationTestStatus {
  UNKNOWN = 'unknown',
  SUCCESS = 'success',
  FAILED = 'failed',
}

export type IntegrationDocument = HydratedDocument<Integration>;

/**
 * Persisted integration configuration. We deliberately split the
 * fields into two buckets:
 *
 *  - `credentials`: secret material (API keys, tokens, app passwords).
 *    NEVER returned to the admin UI in plaintext. Encrypted at rest
 *    via AES-256-GCM by `IntegrationCryptoService`.
 *
 *  - `publicConfig`: non-secret operational data (from-email,
 *    sender name, default region, etc.) — safe to round-trip to the
 *    admin UI.
 *
 *  `provider` says which adapter to use within the slot.
 */
@Schema({ timestamps: true, versionKey: false })
export class Integration {
  @Prop({
    type: String,
    enum: Object.values(IntegrationKey),
    required: true,
    unique: true,
    index: true,
  })
  key!: IntegrationKey;

  @Prop({ required: true, trim: true })
  provider!: string;

  @Prop({ default: false, index: true })
  enabled!: boolean;

  /**
   * Encrypted secret credentials. Stored as `{ field: encryptedBlob }`.
   * `IntegrationCryptoService.encryptMap` / `decryptMap` are the only
   * legitimate ways to read/write this field.
   */
  @Prop({ type: Object, default: {} })
  credentials!: Record<string, string>;

  /** Public, non-sensitive config (host, port, from-name, …). */
  @Prop({ type: Object, default: {} })
  publicConfig!: Record<string, string>;

  @Prop({
    type: String,
    enum: Object.values(IntegrationTestStatus),
    default: IntegrationTestStatus.UNKNOWN,
  })
  lastTestStatus!: IntegrationTestStatus;

  @Prop({ default: '' })
  lastTestMessage!: string;

  @Prop({ type: Date })
  lastTestedAt?: Date;
}

export const IntegrationSchema = SchemaFactory.createForClass(Integration);
