import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationsModule } from '../notifications/notifications.module';
import { ProductsModule } from '../products/products.module';
import { AbandonedCartScannerService } from './abandoned-cart-scanner.service';
import { CartsController } from './carts.controller';
import { CartsService } from './carts.service';
import { Cart, CartSchema } from './schemas/cart.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Cart.name, schema: CartSchema }]),
    ProductsModule,
    NotificationsModule,
  ],
  controllers: [CartsController],
  providers: [CartsService, AbandonedCartScannerService],
  exports: [CartsService],
})
export class CartsModule {}
