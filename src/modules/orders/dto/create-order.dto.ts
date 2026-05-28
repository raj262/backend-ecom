import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaymentMethod } from '../schemas/order.schema';

export class OrderItemInput {
  @IsMongoId() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() size?: string;
}

export class ShippingAddressInput {
  @IsString() fullName!: string;
  @IsString() line1!: string;
  @IsOptional() @IsString() line2?: string;
  @IsString() city!: string;
  @IsString() state!: string;
  @IsString() country!: string;
  @IsString() zip!: string;
  @IsString() phone!: string;
  @IsOptional() @IsString() email?: string;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInput)
  items!: OrderItemInput[];

  @ValidateNested()
  @Type(() => ShippingAddressInput)
  shippingAddress!: ShippingAddressInput;

  @IsEnum(PaymentMethod) paymentMethod!: PaymentMethod;

  /**
   * Discount is NEVER taken from the client. Only `couponCode` produces a
   * discount, and the value is calculated server-side in OrderPricingService.
   */
  @IsOptional() @IsString() @MaxLength(40) couponCode?: string;

  @IsOptional() @IsBoolean() notifyWhatsapp?: boolean;
  @IsOptional() @IsBoolean() notifySms?: boolean;

  /**
   * Amount of wallet balance the customer wants applied to this order.
   * Server clamps to `min(requested, user.walletBalance, payable)`.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  walletAmount?: number;

  /** Required when `paymentMethod === upi`. Format: `name@bank`. */
  @IsOptional()
  @IsString()
  @Matches(/^[\w.\-]{2,}@[\w.\-]{2,}$/, {
    message: 'UPI VPA must look like name@bank',
  })
  upiVpa?: string;
}
