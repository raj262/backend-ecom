import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { OrderStatus } from '../../orders/schemas/order.schema';

export class TrackingInput {
  @IsOptional() @IsString() @MaxLength(60) carrier?: string;
  @IsOptional() @IsString() @MaxLength(60) code?: string;
  @IsOptional() @IsUrl() url?: string;
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => TrackingInput)
  tracking?: TrackingInput;
}
