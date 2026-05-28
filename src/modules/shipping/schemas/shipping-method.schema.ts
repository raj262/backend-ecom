import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type ShippingMethodDocument = HydratedDocument<ShippingMethod>;

/**
 * A shippable rate the storefront can offer at checkout. `freeAbove` lets
 * us bake "free shipping over ₹1,500" into the method rather than hard-
 * coding it in OrdersService.
 */
@Schema({ timestamps: true })
export class ShippingMethod {
  @Prop({ required: true, unique: true, index: true })
  code!: string;

  @Prop({ required: true })
  name!: string;

  @Prop({ default: '' })
  description!: string;

  @Prop({ required: true, min: 0 })
  price!: number;

  // `string | null` / `number | null` unions can't be inferred by @nestjs/mongoose
  // because they erase to `Object` at runtime — `type` is required.
  @Prop({ type: Number, default: null })
  freeAbove!: number | null;

  @Prop({ default: 3 })
  estimatedDays!: number;

  @Prop({ default: true, index: true })
  active!: boolean;

  @Prop({ default: 100, index: true })
  order!: number;
}

export const ShippingMethodSchema =
  SchemaFactory.createForClass(ShippingMethod);
