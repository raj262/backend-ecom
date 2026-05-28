import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PaymentDocument = HydratedDocument<Payment>;

export enum PaymentStatus {
  PENDING = 'pending',
  AUTHORIZED = 'authorized',
  CAPTURED = 'captured',
  FAILED = 'failed',
  REFUNDED = 'refunded',
}

export enum PaymentProvider {
  CASH_ON_DELIVERY = 'cash_on_delivery',
  STRIPE = 'stripe',
  RAZORPAY = 'razorpay',
  EASEBUZZ = 'easebuzz',
  MOCK = 'mock',
}

@Schema({ timestamps: true, versionKey: false })
export class Payment {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true, index: true })
  orderId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, min: 0 }) amount!: number;
  @Prop({ default: 'INR' }) currency!: string;

  @Prop({
    type: String,
    enum: Object.values(PaymentProvider),
    required: true,
    index: true,
  })
  provider!: PaymentProvider;

  @Prop({
    type: String,
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.PENDING,
    index: true,
  })
  status!: PaymentStatus;

  /** External reference from the gateway (Stripe payment_intent, Razorpay id, etc.). */
  @Prop({ index: true }) providerRef?: string;

  /** Optional raw webhook/response payload for debugging. */
  @Prop({ type: Object }) meta?: Record<string, unknown>;

  @Prop() failureReason?: string;
  @Prop({ type: Date }) capturedAt?: Date;
  @Prop({ type: Date }) refundedAt?: Date;
}

export const PaymentSchema = SchemaFactory.createForClass(Payment);
