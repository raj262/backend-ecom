import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, IsString, Min } from 'class-validator';

export class AddItemDto {
  @IsMongoId() productId!: string;
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() size?: string;
}

export class UpdateItemDto {
  @Type(() => Number) @IsInt() @Min(1) quantity!: number;
}
