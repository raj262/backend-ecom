import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApplyCouponDto {
  /** `null` clears the coupon. Otherwise the alphanumeric code. */
  @IsOptional() @IsString() @MaxLength(40) code?: string | null;
}
