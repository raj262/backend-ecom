import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateReviewDto {
  @IsMongoId() productId!: string;

  @Type(() => Number) @IsInt() @Min(1) @Max(5) rating!: number;

  @IsOptional() @IsString() @MaxLength(120) title?: string;

  @IsString() @MinLength(3) @MaxLength(2000) body!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsUrl({}, { each: true })
  media?: string[];
}
