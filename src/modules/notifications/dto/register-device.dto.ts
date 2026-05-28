import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DevicePlatform } from '../schemas/device-token.schema';

export class RegisterDeviceDto {
  /** Expo push token, format `ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]`. */
  @Matches(/^ExponentPushToken\[[A-Za-z0-9_\-]{10,}\]$/, {
    message: 'Invalid Expo push token format',
  })
  token!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(120)
  deviceId!: string;

  @IsEnum(DevicePlatform) platform!: DevicePlatform;

  @IsOptional() @IsString() @MaxLength(80) deviceModel?: string;
  @IsOptional() @IsString() @MaxLength(40) osVersion?: string;
  @IsOptional() @IsString() @MaxLength(40) appVersion?: string;
}
