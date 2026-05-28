import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DeviceInfoDto } from './device-info.dto';

export class GoogleSignInDto {
  /**
   * The `id_token` returned by Google sign-in on the client side
   * (mobile via `expo-auth-session/providers/google`, web via Google
   * Identity Services).
   */
  @IsString()
  @MinLength(8)
  idToken!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  device?: DeviceInfoDto;
}

export class AppleSignInDto {
  @IsString()
  @MinLength(8)
  idToken!: string;

  /**
   * Apple sends `name` only on the very first sign-in (and only via
   * the authorization payload, not the ID token). The client forwards
   * it here so we can save it on user creation.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  device?: DeviceInfoDto;
}
