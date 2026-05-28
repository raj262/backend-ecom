import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePushPreferencesDto {
  @IsOptional() @IsBoolean() orderUpdates?: boolean;
  @IsOptional() @IsBoolean() deliveryUpdates?: boolean;
  @IsOptional() @IsBoolean() flashSales?: boolean;
  @IsOptional() @IsBoolean() cartReminders?: boolean;
  @IsOptional() @IsBoolean() personalizedOffers?: boolean;
}
