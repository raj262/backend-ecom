import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class MergeCartItemDto {
  @IsMongoId() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() size?: string;
  /**
   * Captured at add-to-cart time on the guest client. Used to surface
   * "price changed since you saved this" UX — never trusted for charging.
   */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) priceAtAdd?: number;
}

export class MergeCartDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => MergeCartItemDto)
  items!: MergeCartItemDto[];

  @IsOptional() @IsString() @MaxLength(40) couponCode?: string;
}
