import { plainToInstance } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

/**
 * Runtime guard for required env vars. Wire via
 *   ConfigModule.forRoot({ validate })
 * to fail fast on misconfigured deploys instead of crashing mid-request.
 */
class EnvSchema {
  @IsOptional() @IsString() NODE_ENV?: string;
  @IsOptional() @IsNumber() PORT?: number;

  @IsString() MONGODB_URI!: string;

  @IsString() JWT_ACCESS_SECRET!: string;
  @IsString() JWT_REFRESH_SECRET!: string;
  @IsOptional() @IsString() JWT_ACCESS_TTL?: string;
  @IsOptional() @IsString() JWT_REFRESH_TTL?: string;

  @IsOptional() @IsString() CORS_ORIGIN?: string;
  @IsOptional() @IsNumber() BCRYPT_SALT_ROUNDS?: number;
}

export function validate(config: Record<string, unknown>) {
  const parsed = plainToInstance(EnvSchema, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(parsed, { skipMissingProperties: false });
  if (errors.length) {
    throw new Error(
      `Invalid environment configuration:\n${errors
        .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
        .join('\n')}`,
    );
  }
  return parsed;
}
