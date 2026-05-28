import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';
import { DiscountType } from '../schemas/coupon.schema';

export class CreateCouponDto {
  @IsString()
  @Matches(/^[A-Z0-9_-]{3,32}$/, {
    message: 'code must be uppercase letters/numbers/-/_, 3-32 chars',
  })
  code!: string;

  @IsOptional() @IsString() description?: string;

  @IsEnum(DiscountType) type!: DiscountType;

  @Type(() => Number) @IsNumber() @Min(0) value!: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minSubtotal?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxDiscount?: number;

  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() expiresAt?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) usageLimit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) perUserLimit?: number;

  @IsOptional() @IsBoolean() active?: boolean;
}

export class ValidateCouponDto {
  @IsString() code!: string;
  @Type(() => Number) @IsNumber() @Min(0) subtotal!: number;
}
