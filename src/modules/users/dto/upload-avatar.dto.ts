import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export class UploadAvatarDto {
  @IsString()
  @MaxLength(4_500_000)
  imageBase64!: string;

  @IsOptional()
  @IsIn(MIME_TYPES)
  mimeType?: (typeof MIME_TYPES)[number];
}
