import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Closed list mirrored on mobile so the UI can render a reason
 * picker. Plain strings (not Mongo enum) so we can adjust them
 * over time without a migration.
 */
export const RETURN_REASONS = [
  'wrong_item',
  'damaged',
  'defective',
  'not_as_described',
  'size_or_fit',
  'changed_mind',
  'other',
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export class ReturnItemInput {
  @IsMongoId() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() size?: string;
}

export class CreateReturnDto {
  @IsEnum(RETURN_REASONS)
  reason!: ReturnReason;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnItemInput)
  items!: ReturnItemInput[];
}
