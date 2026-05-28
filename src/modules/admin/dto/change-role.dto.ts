import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { UserRole } from '../../../common/types/user-role.enum';

export class ChangeRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;

  /**
   * Optional custom-role `key`. Pass `null` to clear any existing custom
   * role, omit to leave it untouched, or pass a key (e.g. "content-editor")
   * to assign it. Validation only kicks in when the value is a string.
   */
  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'customRoleKey must be lowercase letters, digits, or dashes',
  })
  customRoleKey?: string | null;
}
