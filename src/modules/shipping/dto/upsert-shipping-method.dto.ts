import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class UpsertShippingMethodDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) price!: number;
  @IsOptional() @IsNumber() @Min(0) freeAbove?: number;
  @IsOptional() @IsInt() @Min(0) estimatedDays?: number;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsInt() order?: number;
}
