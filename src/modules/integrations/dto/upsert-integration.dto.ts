import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Payload for `PUT /admin/integrations/:key`.
 *
 * We do NOT validate the shape of `credentials` / `publicConfig` here —
 * that's enforced by `IntegrationsService.upsert` against the catalog
 * for the chosen provider, so a new provider works without code change.
 */
export class UpsertIntegrationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  provider!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>;

  @IsOptional()
  @IsObject()
  publicConfig?: Record<string, string>;
}

export class TestIntegrationDto {
  /** Optional one-shot recipient for SMS/WhatsApp/Mail test message. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  to?: string;
}
