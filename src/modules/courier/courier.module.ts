import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { OrdersModule } from '../orders/orders.module';
import { CourierController } from './courier.controller';
import { CourierService } from './courier.service';

@Module({
  imports: [
    OrdersModule,
    MongooseModule.forFeature([{ name: Order.name, schema: OrderSchema }]),
  ],
  controllers: [CourierController],
  providers: [CourierService],
})
export class CourierModule {}
