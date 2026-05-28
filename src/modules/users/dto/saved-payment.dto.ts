import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { SavedPaymentType } from '../schemas/user.schema';

export class CreateSavedPaymentDto {
  @IsEnum(SavedPaymentType)
  type!: SavedPaymentType;

  @IsOptional() @IsString() @MaxLength(40) label?: string;
  @IsOptional() @IsString() @MaxLength(40) display?: string;

  /** YYYY-MM expiry — only meaningful for `type=card`. */
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, {
    message: 'expiry must be YYYY-MM',
  })
  expiry?: string;

  @IsOptional() @IsString() @MaxLength(40) provider?: string;
  @IsOptional() @IsString() @MaxLength(200) providerToken?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateSavedPaymentDto {
  @IsOptional() @IsString() @MaxLength(40) label?: string;
  @IsOptional() @IsString() @MaxLength(40) display?: string;
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'expiry must be YYYY-MM' })
  expiry?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
