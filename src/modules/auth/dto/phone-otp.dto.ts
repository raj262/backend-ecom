import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { DeviceInfoDto } from './device-info.dto';

export class RequestPhoneOtpDto {
  /**
   * E.164 ("+91…") — validated against a loose pattern so we accept
   * 8–15 digits while still rejecting obvious garbage.
   */
  @IsString()
  @Matches(/^\+\d{8,15}$/, {
    message: 'phone must be in E.164 format, e.g. +919876543210',
  })
  phone!: string;
}

export class VerifyPhoneOtpDto {
  @IsString()
  @Matches(/^\+\d{8,15}$/, { message: 'phone must be in E.164 format' })
  phone!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(8)
  code!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  device?: DeviceInfoDto;
}
