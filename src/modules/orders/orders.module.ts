import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CouponsModule } from '../coupons/coupons.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';
import { ProductsModule } from '../products/products.module';
import { WalletModule } from '../wallet/wallet.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { Order, OrderSchema } from './schemas/order.schema';
import { GstInvoiceService } from './services/gst-invoice.service';
import { OrderInvoiceService } from './services/order-invoice.service';
import { OrderNotifierService } from './services/order-notifier.service';
import { OrderPricingService } from './services/order-pricing.service';
import { OrderStockService } from './services/order-stock.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
    ProductsModule,
    forwardRef(() => PaymentsModule),
    NotificationsModule,
    CouponsModule,
    WalletModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrderPricingService,
    OrderStockService,
    OrderNotifierService,
    OrderInvoiceService,
    GstInvoiceService,
  ],
  exports: [OrdersService, MongooseModule],
})
export class OrdersModule {}
