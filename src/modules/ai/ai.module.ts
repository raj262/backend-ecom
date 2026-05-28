import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '../orders/schemas/order.schema';
import { Product, ProductSchema } from '../products/schemas/product.schema';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import {
  TrendingSearch,
  TrendingSearchSchema,
} from './schemas/trending-search.schema';
import { TrendingSearchService } from './trending-search.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Product.name, schema: ProductSchema },
      { name: Order.name, schema: OrderSchema },
      { name: TrendingSearch.name, schema: TrendingSearchSchema },
    ]),
  ],
  controllers: [AiController],
  providers: [AiService, TrendingSearchService],
})
export class AiModule {}
