import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  ShippingMethod,
  ShippingMethodSchema,
} from './schemas/shipping-method.schema';
import {
  ShippingZone,
  ShippingZoneSchema,
} from './schemas/shipping-zone.schema';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ShippingMethod.name, schema: ShippingMethodSchema },
      { name: ShippingZone.name, schema: ShippingZoneSchema },
    ]),
  ],
  controllers: [ShippingController],
  providers: [ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
