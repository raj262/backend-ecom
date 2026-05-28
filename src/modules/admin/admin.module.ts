import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [UsersModule, OrdersModule, ReviewsModule],
  controllers: [AdminController],
})
export class AdminModule {}
