import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SCOPES } from '../../../common/types/scopes';
import { UserRole } from '../../../common/types/user-role.enum';

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(40)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'key must be lowercase letters, digits, or dashes',
  })
  key!: string;

  @IsString() @MinLength(2) @MaxLength(60) name!: string;

  @IsOptional() @IsString() @MaxLength(240) description?: string;

  @IsEnum(UserRole) baseRole!: UserRole;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsIn(SCOPES as unknown as string[], { each: true })
  scopes?: string[];

  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateRoleDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MaxLength(240) description?: string;
  @IsOptional() @IsEnum(UserRole) baseRole?: UserRole;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(64)
  @IsIn(SCOPES as unknown as string[], { each: true })
  scopes?: string[];

  @IsOptional() @IsBoolean() active?: boolean;
}
