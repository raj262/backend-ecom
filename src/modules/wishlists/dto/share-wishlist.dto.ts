import { IsBoolean } from 'class-validator';

export class ShareWishlistDto {
  @IsBoolean() sharePublic!: boolean;
}
