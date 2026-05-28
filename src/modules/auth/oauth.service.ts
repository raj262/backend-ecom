import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Verifies third-party OAuth ID tokens without pulling in heavy
 * SDKs. Both Google and Apple ship their public keys at well-known
 * URLs; we fetch + cache them, then verify the JWT signature locally.
 */
@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);

  // JWKS caches (TTL: 24h, providers rotate keys infrequently).
  private googleKeysCache: { keys: JsonWebKey[]; expiresAt: number } | null = null;
  private appleKeysCache: { keys: JsonWebKey[]; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  // ----------------------------------------------------------------
  // Google
  // ----------------------------------------------------------------

  async verifyGoogleIdToken(idToken: string): Promise<{
    providerId: string;
    email: string | null;
    emailVerified: boolean;
    name: string | null;
    avatarUrl?: string;
  }> {
    const expectedAudiences = (this.config.get<string>('GOOGLE_CLIENT_IDS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = await verifyJwtViaJwks({
      token: idToken,
      jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
      cache: () => this.googleKeysCache,
      setCache: (v) => (this.googleKeysCache = v),
      expectedIssuer: ['https://accounts.google.com', 'accounts.google.com'],
      expectedAudiences: expectedAudiences.length ? expectedAudiences : null,
    });

    if (!payload.sub) throw new UnauthorizedException('Google token missing subject');

    return {
      providerId: String(payload.sub),
      email: typeof payload.email === 'string' ? payload.email : null,
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : null,
      avatarUrl: typeof payload.picture === 'string' ? payload.picture : undefined,
    };
  }

  // ----------------------------------------------------------------
  // Apple
  // ----------------------------------------------------------------

  async verifyAppleIdToken(idToken: string): Promise<{
    providerId: string;
    email: string | null;
    name: string | null;
  }> {
    const expectedAudiences = (this.config.get<string>('APPLE_CLIENT_IDS') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const payload = await verifyJwtViaJwks({
      token: idToken,
      jwksUrl: 'https://appleid.apple.com/auth/keys',
      cache: () => this.appleKeysCache,
      setCache: (v) => (this.appleKeysCache = v),
      expectedIssuer: ['https://appleid.apple.com'],
      expectedAudiences: expectedAudiences.length ? expectedAudiences : null,
    });

    if (!payload.sub) throw new UnauthorizedException('Apple token missing subject');

    return {
      providerId: String(payload.sub),
      // Apple may omit `email` after the first sign-in (private relay).
      email: typeof payload.email === 'string' ? payload.email : null,
      // Apple never sends `name` in the ID token — the client passes it
      // through a separate field on first sign-in. The controller layer
      // is responsible for merging it.
      name: null,
    };
  }
}

// ===================================================================
// Pure JWT/JWKS verification (no external libs).
// Production-grade enough for ID tokens: we validate signature, issuer,
// audience, exp, and iat.
// ===================================================================

interface IdTokenPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  iat?: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  [k: string]: unknown;
}

async function verifyJwtViaJwks(args: {
  token: string;
  jwksUrl: string;
  cache: () => { keys: JsonWebKey[]; expiresAt: number } | null;
  setCache: (v: { keys: JsonWebKey[]; expiresAt: number }) => void;
  expectedIssuer: string[];
  expectedAudiences: string[] | null;
}): Promise<IdTokenPayload> {
  const { token, jwksUrl, cache, setCache, expectedIssuer, expectedAudiences } = args;

  const parts = token.split('.');
  if (parts.length !== 3) throw new UnauthorizedException('Malformed ID token');

  const [rawHeader, rawPayload, rawSignature] = parts;
  const header = safeJsonParse(base64UrlDecode(rawHeader)) as { kid?: string; alg?: string };
  const payload = safeJsonParse(base64UrlDecode(rawPayload)) as IdTokenPayload;

  if (!header.kid || header.alg !== 'RS256') {
    throw new UnauthorizedException('Unsupported ID token signing algorithm');
  }
  if (!payload.iss || !expectedIssuer.includes(payload.iss)) {
    throw new UnauthorizedException('Bad ID token issuer');
  }
  if (expectedAudiences) {
    const audList = Array.isArray(payload.aud) ? payload.aud : [payload.aud ?? ''];
    const matches = audList.some((a) => expectedAudiences.includes(a));
    if (!matches) throw new UnauthorizedException('Bad ID token audience');
  }
  if (!payload.exp || payload.exp * 1000 < Date.now()) {
    throw new UnauthorizedException('ID token expired');
  }

  // Fetch (or reuse) JWKS.
  let keys = cache();
  if (!keys || keys.expiresAt < Date.now()) {
    const res = await fetch(jwksUrl);
    if (!res.ok) throw new UnauthorizedException(`JWKS fetch failed: HTTP ${res.status}`);
    const body = (await res.json()) as { keys: JsonWebKey[] };
    keys = { keys: body.keys, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
    setCache(keys);
  }
  const jwk = keys.keys.find((k) => (k as { kid?: string }).kid === header.kid);
  if (!jwk) throw new UnauthorizedException('Signing key not found in JWKS');

  // Import key + verify signature with WebCrypto.
  const crypto = await import('crypto');
  const { webcrypto } = crypto;
  const key = await webcrypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const data = new TextEncoder().encode(`${rawHeader}.${rawPayload}`);
  const signature = base64UrlDecodeToBytes(rawSignature);
  const ok = await webcrypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
  if (!ok) throw new UnauthorizedException('ID token signature invalid');

  return payload;
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
    'utf8',
  );
}

function base64UrlDecodeToBytes(input: string): Uint8Array {
  return new Uint8Array(
    Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
  );
}

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    throw new BadRequestException('Malformed ID token JSON');
  }
}
