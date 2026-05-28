import { IsInt, IsOptional, IsString } from 'class-validator';

export class AdjustStockDto {
  @IsString() productId!: string;
  @IsString() sku!: string;
  @IsInt() delta!: number;
  @IsOptional() @IsString() warehouse?: string;
  @IsOptional() @IsString() reason?: string;
}
