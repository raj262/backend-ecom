import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrderDocument = HydratedDocument<Order>;

export enum OrderStatus {
  PENDING = 'pending',
  PAID = 'paid',
  PROCESSING = 'processing',
  PACKED = 'packed',
  SHIPPED = 'shipped',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  CANCELLED = 'cancelled',
  RETURNED = 'returned',
}

/**
 * Permitted forward transitions. Used by `OrdersService.setStatus` to reject
 * impossible flips like delivered → pending. Cancellations from any pre-ship
 * state are handled separately in `cancel()`.
 */
export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.PAID, OrderStatus.CANCELLED],
  [OrderStatus.PAID]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.PACKED, OrderStatus.CANCELLED],
  [OrderStatus.PACKED]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.OUT_FOR_DELIVERY, OrderStatus.RETURNED],
  [OrderStatus.OUT_FOR_DELIVERY]: [OrderStatus.DELIVERED, OrderStatus.RETURNED],
  [OrderStatus.DELIVERED]: [OrderStatus.RETURNED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.RETURNED]: [],
};

export enum PaymentMethod {
  CARD = 'card',
  UPI = 'upi',
  COD = 'cod',
}

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId!: Types.ObjectId;

  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) image!: string;
  @Prop({ required: true, min: 1 }) quantity!: number;
  @Prop({ required: true, min: 0 }) price!: number;
  @Prop() color?: string;
  @Prop() size?: string;
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);

@Schema({ _id: false })
export class ShippingAddress {
  @Prop({ required: true }) fullName!: string;
  @Prop({ required: true }) line1!: string;
  @Prop() line2?: string;
  @Prop({ required: true }) city!: string;
  @Prop({ required: true }) state!: string;
  @Prop({ required: true }) country!: string;
  @Prop({ required: true }) zip!: string;
  @Prop({ required: true }) phone!: string;
  @Prop() email?: string;
}

export const ShippingAddressSchema = SchemaFactory.createForClass(ShippingAddress);

@Schema({ _id: false })
export class OrderTracking {
  @Prop() carrier?: string;
  @Prop({ index: true }) code?: string;
  @Prop() url?: string;
  @Prop({ type: Date }) shippedAt?: Date;
}
export const OrderTrackingSchema = SchemaFactory.createForClass(OrderTracking);

@Schema({ _id: false })
export class OrderInvoice {
  @Prop({ index: true }) number?: string;
  @Prop({ type: Date }) issuedAt?: Date;
  @Prop() pdfUrl?: string;
}
export const OrderInvoiceSchema = SchemaFactory.createForClass(OrderInvoice);

/**
 * Append-only audit log of every status transition on an order.
 * Drives the customer-facing "tracking" timeline so each step has a
 * real timestamp (and optional note) instead of fake interpolated
 * estimates. We embed instead of using a separate collection because
 * the entries are always read together with the order.
 */
@Schema({ _id: false })
export class OrderEvent {
  @Prop({
    type: String,
    enum: Object.values(OrderStatus),
    required: true,
  })
  status!: OrderStatus;

  @Prop({ type: Date, required: true }) at!: Date;
  @Prop() note?: string;
  /** Who triggered it — `customer`, `system`, or an admin user id. */
  @Prop() actor?: string;
}
export const OrderEventSchema = SchemaFactory.createForClass(OrderEvent);

export enum ReturnStatus {
  REQUESTED = 'requested',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  REFUNDED = 'refunded',
}

@Schema({ _id: false })
export class ReturnItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId!: Types.ObjectId;
  @Prop({ required: true, min: 1 }) quantity!: number;
  @Prop() color?: string;
  @Prop() size?: string;
}
export const ReturnItemSchema = SchemaFactory.createForClass(ReturnItem);

/**
 * Customer-initiated return request. Lives embedded so a single
 * `findOne(order)` call yields everything the order detail screen
 * needs. Today an order can have at most one open return; supporting
 * partial-then-second returns is left for a future iteration.
 */
@Schema({ _id: false })
export class OrderReturn {
  @Prop({
    type: String,
    enum: Object.values(ReturnStatus),
    required: true,
  })
  status!: ReturnStatus;

  @Prop({ required: true }) reason!: string;
  @Prop() note?: string;
  @Prop({ type: [ReturnItemSchema], default: [] })
  items!: ReturnItem[];

  /** Final refund amount (calculated when the return is approved). */
  @Prop({ default: 0 }) refundAmount!: number;
  /** Where the refund went — `wallet`, the original payment method, etc. */
  @Prop() refundDestination?: string;

  @Prop({ type: Date, required: true }) requestedAt!: Date;
  @Prop({ type: Date }) decidedAt?: Date;
  @Prop() decidedBy?: string;
  @Prop() decisionNote?: string;
}
export const OrderReturnSchema = SchemaFactory.createForClass(OrderReturn);

@Schema({ timestamps: true, versionKey: false })
export class Order {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ required: true, unique: true, index: true })
  orderNumber!: string;

  @Prop({ type: [OrderItemSchema], default: [] })
  items!: OrderItem[];

  @Prop({ type: ShippingAddressSchema, required: true })
  shippingAddress!: ShippingAddress;

  @Prop({
    type: String,
    enum: Object.values(PaymentMethod),
    required: true,
  })
  paymentMethod!: PaymentMethod;

  @Prop({ default: 0 }) subtotal!: number;
  @Prop({ default: 0 }) shippingFee!: number;
  @Prop({ default: 0 }) codFee!: number;
  @Prop({ default: 0 }) discount!: number;
  @Prop({ default: 0 }) tax!: number;
  @Prop({ default: 0 }) total!: number;

  /** Wallet credit applied to this order (₹). Already debited from user.walletBalance. */
  @Prop({ default: 0 }) walletAmount!: number;
  /** Net amount the customer still has to pay via card/upi/cod. */
  @Prop({ default: 0 }) payable!: number;
  /** Optional UPI VPA captured at checkout (for UPI orders). */
  @Prop() upiVpa?: string;

  @Prop() couponCode?: string;
  @Prop() notifyWhatsapp?: boolean;
  @Prop() notifySms?: boolean;

  @Prop({
    type: String,
    enum: Object.values(OrderStatus),
    default: OrderStatus.PENDING,
    index: true,
  })
  status!: OrderStatus;

  /** Courier assigned for last-mile delivery (claim on start). */
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  assignedCourierId?: Types.ObjectId;

  @Prop() cancelledAt?: Date;
  @Prop() deliveredAt?: Date;

  @Prop({ type: OrderTrackingSchema, default: () => ({}) })
  tracking!: OrderTracking;

  @Prop({ type: OrderInvoiceSchema, default: () => ({}) })
  invoice!: OrderInvoice;

  @Prop({ type: [OrderEventSchema], default: [] })
  events!: OrderEvent[];

  @Prop({ type: OrderReturnSchema, default: null })
  returnRequest!: OrderReturn | null;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
