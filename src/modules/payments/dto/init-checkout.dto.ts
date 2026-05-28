import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class InitCheckoutDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(20) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) name?: string;
}
