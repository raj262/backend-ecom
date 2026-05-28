import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Embedded device metadata that every login/register call carries.
 * Optional so legacy clients keep working (deviceId falls back to
 * `unknown-<remote-ip>`), but the mobile app always sends it.
 */
export class DeviceInfoDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  platform?: string;
}
