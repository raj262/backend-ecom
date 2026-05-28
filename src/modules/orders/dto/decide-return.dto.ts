import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideReturnDto {
  @IsEnum(['approve', 'reject'])
  action!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
