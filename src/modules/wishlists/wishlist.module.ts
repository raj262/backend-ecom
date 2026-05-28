import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { PriceDropScannerService } from './price-drop-scanner.service';
import { Wishlist, WishlistSchema } from './schemas/wishlist.schema';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Wishlist.name, schema: WishlistSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [WishlistController],
  providers: [WishlistService, PriceDropScannerService],
})
export class WishlistModule {}
