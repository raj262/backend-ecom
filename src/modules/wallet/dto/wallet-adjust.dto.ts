import { IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

/**
 * Admin-only credit. Real top-ups go through a payment gateway flow
 * (out of scope here); this endpoint lets ops grant cashback,
 * goodwill credits, etc.
 */
export class WalletAdjustDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  note?: string;
}
