import { IsOptional, IsString } from 'class-validator';

export class MarkCapturedDto {
  @IsOptional() @IsString() providerRef?: string;
}
