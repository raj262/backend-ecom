import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type NotificationDocument = HydratedDocument<Notification>;

export enum NotificationType {
  ORDER_PLACED = 'order_placed',
  ORDER_SHIPPED = 'order_shipped',
  ORDER_DELIVERED = 'order_delivered',
  ORDER_CANCELLED = 'order_cancelled',
  PAYMENT_RECEIVED = 'payment_received',
  PRICE_DROP = 'price_drop',
  COUPON = 'coupon',
  SYSTEM = 'system',
}

export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  SMS = 'sms',
  WHATSAPP = 'whatsapp',
  PUSH = 'push',
}

@Schema({ timestamps: true, versionKey: false })
export class Notification {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(NotificationType),
    required: true,
  })
  type!: NotificationType;

  @Prop({
    type: [String],
    enum: Object.values(NotificationChannel),
    default: [NotificationChannel.IN_APP],
  })
  channels!: NotificationChannel[];

  @Prop({ required: true }) title!: string;
  @Prop({ default: '' }) body!: string;

  /** Optional deep-link path (e.g. `/orders/abc123`). */
  @Prop() href?: string;

  /** Loose metadata bag for context (orderId, productId, etc.). */
  @Prop({ type: Object }) data?: Record<string, unknown>;

  @Prop({ default: false, index: true }) read!: boolean;
  @Prop({ type: Date }) readAt?: Date;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, read: 1 });
