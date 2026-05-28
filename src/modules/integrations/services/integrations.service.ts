import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Integration,
  IntegrationDocument,
  IntegrationKey,
  IntegrationTestStatus,
} from '../schemas/integration.schema';
import {
  CatalogProvider,
  findProvider,
  PROVIDER_CATALOG,
} from '../provider-catalog';
import { UpsertIntegrationDto } from '../dto/upsert-integration.dto';
import { IntegrationCryptoService } from './integration-crypto.service';

export interface DecryptedIntegration {
  key: IntegrationKey;
  provider: string;
  enabled: boolean;
  credentials: Record<string, string>;
  publicConfig: Record<string, string>;
}

export interface PublicIntegration {
  key: IntegrationKey;
  provider: string;
  enabled: boolean;
  /** `field → true` if a secret value is set (we never round-trip the value). */
  credentialsSet: Record<string, boolean>;
  publicConfig: Record<string, string>;
  lastTestStatus: IntegrationTestStatus;
  lastTestMessage: string;
  lastTestedAt: Date | null;
}

@Injectable()
export class IntegrationsService implements OnModuleInit {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    @InjectModel(Integration.name)
    private readonly integrationModel: Model<IntegrationDocument>,
    private readonly crypto: IntegrationCryptoService,
  ) {}

  /**
   * Make sure a placeholder row exists for every integration slot, so
   * the admin UI always renders 4 panels even before any provider has
   * been configured. Idempotent.
   */
  async onModuleInit() {
    for (const section of PROVIDER_CATALOG) {
      await this.integrationModel
        .updateOne(
          { key: section.key },
          {
            $setOnInsert: {
              key: section.key,
              provider: section.providers[0]?.id ?? '',
              enabled: false,
              credentials: {},
              publicConfig: {},
              lastTestStatus: IntegrationTestStatus.UNKNOWN,
              lastTestMessage: '',
            },
          },
          { upsert: true },
        )
        .exec();
    }
  }

  // -------------------------------------------------------------------
  // Reads — for the admin UI (redacted) and for internal callers (raw)
  // -------------------------------------------------------------------

  async listPublic(): Promise<PublicIntegration[]> {
    const rows = await this.integrationModel.find().exec();
    return rows.map((r) => this.toPublic(r));
  }

  async getPublic(key: IntegrationKey): Promise<PublicIntegration> {
    const row = await this.findOrFail(key);
    return this.toPublic(row);
  }

  /**
   * Decrypted, ready-to-use view. **Never** return this from a
   * controller — only call from inside the backend (payment adapters,
   * mailer, SMS sender, …).
   */
  async getDecrypted(key: IntegrationKey): Promise<DecryptedIntegration | null> {
    const row = await this.integrationModel.findOne({ key }).exec();
    if (!row) return null;
    return {
      key: row.key,
      provider: row.provider,
      enabled: row.enabled,
      credentials: this.crypto.decryptMap(row.credentials ?? {}),
      publicConfig: { ...(row.publicConfig ?? {}) },
    };
  }

  // -------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------

  async upsert(
    key: IntegrationKey,
    dto: UpsertIntegrationDto,
  ): Promise<PublicIntegration> {
    const catalogProvider = findProvider(key, dto.provider);
    if (!catalogProvider) {
      throw new BadRequestException(
        `Unknown provider "${dto.provider}" for integration "${key}". ` +
          `Valid providers: ${PROVIDER_CATALOG.find((s) => s.key === key)
            ?.providers.map((p) => p.id)
            .join(', ')}`,
      );
    }

    const allowedSecrets = new Set(
      catalogProvider.fields.filter((f) => f.secret).map((f) => f.name),
    );
    const allowedPublics = new Set(
      catalogProvider.fields.filter((f) => !f.secret).map((f) => f.name),
    );

    // Reject any unknown field — strict allow-list per provider.
    for (const k of Object.keys(dto.credentials ?? {})) {
      if (!allowedSecrets.has(k)) {
        throw new BadRequestException(
          `Field "${k}" is not a credential of provider "${dto.provider}".`,
        );
      }
    }
    for (const k of Object.keys(dto.publicConfig ?? {})) {
      if (!allowedPublics.has(k)) {
        throw new BadRequestException(
          `Field "${k}" is not a public config field of provider "${dto.provider}".`,
        );
      }
    }

    const existing = await this.findOrFail(key);

    // Merge: only overwrite credential fields that the client actually
    // sent (so the admin can update one field at a time without having
    // to retype every secret).
    const existingCreds = existing.credentials ?? {};
    const incomingCreds = dto.credentials ?? {};
    const mergedSecrets: Record<string, string> = { ...existingCreds };
    if (existing.provider !== dto.provider) {
      // Provider changed → throw away the old creds entirely.
      for (const k of Object.keys(mergedSecrets)) delete mergedSecrets[k];
    }
    for (const [k, v] of Object.entries(incomingCreds)) {
      if (v === '' || v == null) continue; // skip blanks — keep old value
      mergedSecrets[k] = this.crypto.encrypt(v);
    }

    const mergedPublic: Record<string, string> = {
      ...(existing.publicConfig ?? {}),
      ...(dto.publicConfig ?? {}),
    };
    if (existing.provider !== dto.provider) {
      for (const k of Object.keys(mergedPublic)) {
        if (!allowedPublics.has(k)) delete mergedPublic[k];
      }
    }

    existing.provider = dto.provider;
    existing.enabled = dto.enabled ?? existing.enabled;
    existing.credentials = mergedSecrets;
    existing.publicConfig = mergedPublic;
    // Any change invalidates the previous test result.
    existing.lastTestStatus = IntegrationTestStatus.UNKNOWN;
    existing.lastTestMessage = '';
    existing.lastTestedAt = undefined;
    await existing.save();

    return this.toPublic(existing);
  }

  async setEnabled(
    key: IntegrationKey,
    enabled: boolean,
  ): Promise<PublicIntegration> {
    const row = await this.findOrFail(key);
    row.enabled = enabled;
    await row.save();
    return this.toPublic(row);
  }

  async recordTestResult(
    key: IntegrationKey,
    status: IntegrationTestStatus,
    message: string,
  ): Promise<PublicIntegration> {
    const row = await this.findOrFail(key);
    row.lastTestStatus = status;
    row.lastTestMessage = message.slice(0, 500);
    row.lastTestedAt = new Date();
    await row.save();
    return this.toPublic(row);
  }

  // -------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------

  /** Catalog used by the admin UI to render the provider picker. */
  catalog() {
    return PROVIDER_CATALOG;
  }

  /**
   * Resolve the currently-enabled provider for a slot, with its
   * decrypted credentials. Returns `null` if the slot is disabled or
   * its credentials are incomplete — callers should fall back to the
   * env-based behaviour in that case.
   */
  async resolveActive(
    key: IntegrationKey,
  ): Promise<(DecryptedIntegration & { catalog: CatalogProvider }) | null> {
    const decrypted = await this.getDecrypted(key);
    if (!decrypted || !decrypted.enabled) return null;
    const catalog = findProvider(key, decrypted.provider);
    if (!catalog) {
      this.logger.warn(
        `Integration "${key}" is enabled but provider "${decrypted.provider}" is not in the catalog.`,
      );
      return null;
    }
    // Ensure every required credential / public field is present.
    for (const field of catalog.fields) {
      if (!field.required) continue;
      const bucket = field.secret ? decrypted.credentials : decrypted.publicConfig;
      if (!bucket[field.name]) {
        this.logger.warn(
          `Integration "${key}" missing required field "${field.name}" — treating as inactive.`,
        );
        return null;
      }
    }
    return { ...decrypted, catalog };
  }

  private async findOrFail(key: IntegrationKey): Promise<IntegrationDocument> {
    const row = await this.integrationModel.findOne({ key }).exec();
    if (!row) throw new NotFoundException(`Integration "${key}" not configured`);
    return row;
  }

  private toPublic(row: IntegrationDocument): PublicIntegration {
    return {
      key: row.key,
      provider: row.provider,
      enabled: row.enabled,
      credentialsSet: this.crypto.redactMap(row.credentials ?? {}),
      publicConfig: { ...(row.publicConfig ?? {}) },
      lastTestStatus: row.lastTestStatus,
      lastTestMessage: row.lastTestMessage,
      lastTestedAt: row.lastTestedAt ?? null,
    };
  }
}
