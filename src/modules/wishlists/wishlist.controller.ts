import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtUser } from '../../common/types/jwt-user.interface';
import { ShareWishlistDto } from './dto/share-wishlist.dto';
import { WishlistService } from './wishlist.service';

@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  get(@CurrentUser() user: JwtUser) {
    return this.wishlist.get(user.sub);
  }

  /** Same wishlist + per-item price-drop signals for the badge. */
  @Get('signals')
  getSignals(@CurrentUser() user: JwtUser) {
    return this.wishlist.getWithSignals(user.sub);
  }

  @Post(':productId')
  add(@CurrentUser() user: JwtUser, @Param('productId') productId: string) {
    return this.wishlist.add(user.sub, productId);
  }

  @Delete(':productId')
  remove(@CurrentUser() user: JwtUser, @Param('productId') productId: string) {
    return this.wishlist.remove(user.sub, productId);
  }

  @Post('share')
  share(@CurrentUser() user: JwtUser, @Body() dto: ShareWishlistDto) {
    return this.wishlist.setSharing(user.sub, dto.sharePublic);
  }

  @Get('share/:slug')
  @Public()
  publicShare(@Param('slug') slug: string) {
    return this.wishlist.getBySlug(slug);
  }
}
