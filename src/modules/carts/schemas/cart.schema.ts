import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CartDocument = HydratedDocument<Cart>;

@Schema({ _id: false })
export class CartItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId!: Types.ObjectId;

  @Prop({ required: true, min: 1 }) quantity!: number;
  @Prop() color?: string;
  @Prop() size?: string;

  /** Captured at add-to-cart time so price changes don't silently surprise. */
  @Prop({ required: true, min: 0 }) priceAtAdd!: number;
}

export const CartItemSchema = SchemaFactory.createForClass(CartItem);

@Schema({ timestamps: true, versionKey: false })
export class Cart {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId!: Types.ObjectId;

  @Prop({ type: [CartItemSchema], default: [] })
  items!: CartItem[];

  @Prop() couponCode?: string;

  /**
   * Timestamp of the last "you left these in your bag" push we sent
   * for this cart. The scanner uses this to avoid double-pinging
   * users every time the job runs.
   */
  @Prop({ type: Date }) lastReminderAt?: Date;
}

export const CartSchema = SchemaFactory.createForClass(Cart);
