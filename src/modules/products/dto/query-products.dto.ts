import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

export type ProductSort =
  | 'latest'
  | 'popular'
  | 'price-asc'
  | 'price-desc'
  | 'rating';

export class QueryProductsDto extends PaginationDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() size?: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maxPrice?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minRating?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  onSale?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isNew?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsIn(['latest', 'popular', 'price-asc', 'price-desc', 'rating'])
  sort?: ProductSort;
}
