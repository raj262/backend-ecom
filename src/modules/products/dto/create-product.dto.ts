import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class VariantDto {
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() size?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) stock?: number;
  @IsOptional() @IsString() sku?: string;
}

export class CreateProductDto {
  @IsString() name!: string;

  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase letters, numbers, and dashes',
  })
  slug!: string;

  @IsOptional() @IsString() description?: string;

  @Type(() => Number) @IsNumber() @Min(0) price!: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) oldPrice?: number;

  @IsOptional() @IsArray() @IsString({ each: true }) images?: string[];

  @IsString() category!: string;
  @IsString() brand!: string;

  @IsOptional() @IsArray() @IsString({ each: true }) colors?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) sizes?: string[];

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(5) rating?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) reviewCount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) stock?: number;

  @IsOptional() @IsBoolean() isFeatured?: boolean;
  @IsOptional() @IsBoolean() isNew?: boolean;
  @IsOptional() @IsBoolean() onSale?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;

  @IsOptional() @IsArray() variants?: VariantDto[];
}
