import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IntegrationsModule } from '../integrations/integrations.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { EasebuzzProvider } from './providers/easebuzz.provider';
import { RazorpayProvider } from './providers/razorpay.provider';
import { Payment, PaymentSchema } from './schemas/payment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Payment.name, schema: PaymentSchema }]),
    forwardRef(() => OrdersModule),
    IntegrationsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, RazorpayProvider, EasebuzzProvider],
  exports: [PaymentsService, MongooseModule],
})
export class PaymentsModule {}
