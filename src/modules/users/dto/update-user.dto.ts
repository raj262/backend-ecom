import { Type } from 'class-transformer';
import {
  IsArray,
  IsEmail,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class AddressDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() line1?: string;
  @IsOptional() @IsString() line2?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() zip?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() isDefault?: boolean;
}

/** Languages the in-app picker shows. Keep in sync with the mobile catalog. */
const GENDERS = [
  'female',
  'male',
  'non_binary',
  'prefer_not_to_say',
] as const;

const SUPPORTED_LANGUAGES = [
  'en',
  'hi',
  'mr',
  'ta',
  'te',
  'bn',
  'gu',
  'kn',
  'ml',
  'pa',
] as const;

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsUrl()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'Phone must be 7–15 digits.' })
  phone?: string;

  /** Stored as `YYYY-MM-DD`. */
  @IsOptional()
  @IsISO8601({ strict: true })
  dob?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string;

  @IsOptional()
  @IsIn(GENDERS, {
    message: `Gender must be one of: ${GENDERS.join(', ')}.`,
  })
  gender?: string;

  @IsOptional()
  @IsIn(SUPPORTED_LANGUAGES, {
    message: `Language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}.`,
  })
  language?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddressDto)
  addresses?: AddressDto[];
}
