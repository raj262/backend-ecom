import { IsString, MaxLength, MinLength } from 'class-validator';

export class TrackSearchDto {
  @IsString() @MinLength(1) @MaxLength(120) term!: string;
}
