import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Body for `POST /users/me/addresses` and `PATCH /users/me/addresses/:id`.
 *
 * Stricter than the legacy `AddressDto` (which was effectively all-optional
 * for the catch-all `PATCH /users/me`) because this endpoint owns the
 * lifecycle: a freshly-created address must have the fields a courier
 * actually needs.
 */
export class CreateAddressDto {
  @IsOptional() @IsString() @MaxLength(40) label?: string;

  @IsString() @MinLength(2) @MaxLength(80) fullName!: string;
  @IsString() @MinLength(4) @MaxLength(120) line1!: string;
  @IsOptional() @IsString() @MaxLength(120) line2?: string;
  @IsString() @MinLength(2) @MaxLength(60) city!: string;
  @IsString() @MinLength(2) @MaxLength(60) state!: string;
  @IsString() @MinLength(2) @MaxLength(60) country!: string;
  @Matches(/^[0-9A-Za-z\- ]{4,12}$/) zip!: string;
  @Matches(/^[+\d][\d\s-]{6,}$/) phone!: string;

  /** Optional GSTIN for B2B buyers — surfaces on the invoice. */
  @IsOptional()
  @Matches(/^[0-9A-Z]{15}$/, { message: 'GSTIN must be 15 characters' })
  gstin?: string;

  @IsOptional() @IsBoolean() isDefault?: boolean;
}

/**
 * PATCH body — every field optional. Re-uses the same validation
 * shape so we don't drift from the create payload.
 */
export class UpdateAddressDto {
  @IsOptional() @IsString() @MaxLength(40) label?: string;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) fullName?: string;
  @IsOptional() @IsString() @MinLength(4) @MaxLength(120) line1?: string;
  @IsOptional() @IsString() @MaxLength(120) line2?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) city?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) state?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) country?: string;
  @IsOptional() @Matches(/^[0-9A-Za-z\- ]{4,12}$/) zip?: string;
  @IsOptional() @Matches(/^[+\d][\d\s-]{6,}$/) phone?: string;
  @IsOptional()
  @Matches(/^[0-9A-Z]{15}$/, { message: 'GSTIN must be 15 characters' })
  gstin?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
