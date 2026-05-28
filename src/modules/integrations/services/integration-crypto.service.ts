import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/**
 * Symmetric encryption for integration credentials.
 *
 * - AES-256-GCM (authenticated encryption — tampered blobs throw on read).
 * - Key derived from `INTEGRATIONS_SECRET` (or `JWT_ACCESS_SECRET` as a
 *   dev fallback) via SHA-256 so any string length works.
 * - Blob format: `base64(iv) : base64(authTag) : base64(ciphertext)`
 *
 * Rotating the secret invalidates previously-stored credentials. Plan a
 * migration before changing `INTEGRATIONS_SECRET` in production.
 */
@Injectable()
export class IntegrationCryptoService {
  private readonly logger = new Logger(IntegrationCryptoService.name);
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    const raw =
      this.config.get<string>('INTEGRATIONS_SECRET') ??
      this.config.get<string>('JWT_ACCESS_SECRET') ??
      '';
    if (!raw) {
      this.logger.warn(
        'No INTEGRATIONS_SECRET or JWT_ACCESS_SECRET set — using a fixed dev key. ' +
          'DO NOT run this in production without setting INTEGRATIONS_SECRET.',
      );
    }
    this.key = createHash('sha256')
      .update(raw || 'lumiere-integrations-dev-secret-do-not-use')
      .digest();
  }

  encrypt(plain: string): string {
    if (plain === '' || plain == null) return '';
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, this.key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
  }

  decrypt(blob: string): string {
    if (!blob) return '';
    const parts = blob.split(':');
    if (parts.length !== 3) {
      // Tolerate legacy/dev plaintext rather than refusing to boot.
      return blob;
    }
    try {
      const [ivB64, tagB64, encB64] = parts;
      const iv = Buffer.from(ivB64, 'base64');
      const tag = Buffer.from(tagB64, 'base64');
      const enc = Buffer.from(encB64, 'base64');
      if (iv.length !== IV_LEN || tag.length !== TAG_LEN) return '';
      const decipher = createDecipheriv(ALGO, this.key, iv);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
      return dec.toString('utf8');
    } catch (err) {
      this.logger.warn(
        `Integration credential decrypt failed (key rotated or tampered): ${
          (err as Error).message
        }`,
      );
      return '';
    }
  }

  encryptMap(input: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(input)) {
      out[k] = this.encrypt(v ?? '');
    }
    return out;
  }

  decryptMap(input: Record<string, string>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(input ?? {})) {
      out[k] = this.decrypt(v ?? '');
    }
    return out;
  }

  /**
   * Returns a copy with every value replaced by a fixed mask so the
   * admin UI can show "this credential is set" without ever leaking
   * the secret over the wire.
   */
  redactMap(input: Record<string, string>): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(input ?? {})) {
      out[k] = Boolean(v && v.length > 0);
    }
    return out;
  }
}
