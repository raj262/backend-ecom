import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpsertZoneDto {
  @IsString() @MaxLength(40) code!: string;
  @IsString() @MaxLength(120) name!: string;

  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true })
  countries?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsString({ each: true })
  states?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true })
  cities?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsString({ each: true })
  postalPrefixes?: string[];

  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true })
  methodCodes?: string[];

  @IsOptional() @IsBoolean() active?: boolean;
}
