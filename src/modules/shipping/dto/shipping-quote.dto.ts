import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class ShippingQuoteDto {
  @IsOptional() @IsString() @Length(2, 2) country?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() postal?: string;

  @Type(() => Number) @IsNumber() @Min(0) subtotal!: number;
}
