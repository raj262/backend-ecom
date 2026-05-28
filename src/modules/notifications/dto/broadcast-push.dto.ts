import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class FlashSaleBroadcastDto {
  @IsString() @MinLength(2) @MaxLength(60) title!: string;
  @IsString() @MinLength(2) @MaxLength(160) body!: string;

  /** Where the tap lands — e.g. `/shop?sale=1`. */
  @IsOptional() @IsString() @MaxLength(120) url?: string;

  /**
   * TTL in seconds. Defaults to 30 minutes — most flash sales are
   * stale within an hour, no point pinging late arrivals.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(86_400)
  ttlSeconds?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  badge?: number;
}

export class PersonalizedOfferBroadcastDto {
  @IsString() @MinLength(2) @MaxLength(60) title!: string;
  @IsString() @MinLength(2) @MaxLength(160) body!: string;
  @IsOptional() @IsString() @MaxLength(120) url?: string;

  /** Optional category filter (e.g. `apparel`) — implementation hint only. */
  @IsOptional() @IsString() @MaxLength(60) category?: string;
}
