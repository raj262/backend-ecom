import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { UserRole } from '../../../common/types/user-role.enum';

/**
 * Admin-side user creation. Unlike `RegisterDto` (storefront sign-up),
 * the admin chooses the role explicitly and can optionally attach a
 * custom-role key. The password is required so the new account is
 * immediately usable — there's no email-invite flow yet.
 */
export class AdminCreateUserDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;

  @IsEmail() @MaxLength(120) email!: string;

  @IsString() @MinLength(8) @MaxLength(72) password!: string;

  @IsEnum(UserRole) role!: UserRole;

  @IsOptional() @IsString() @MaxLength(60) phone?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'customRoleKey must be lowercase letters, digits, or dashes',
  })
  customRoleKey?: string | null;

  @IsOptional() @IsBoolean() active?: boolean;
}
