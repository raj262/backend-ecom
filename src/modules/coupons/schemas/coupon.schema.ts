import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CouponDocument = HydratedDocument<Coupon>;

export enum DiscountType {
  PERCENT = 'percent',
  FIXED = 'fixed',
}

@Schema({ timestamps: true, versionKey: false })
export class Coupon {
  @Prop({ required: true, unique: true, uppercase: true, trim: true, index: true })
  code!: string;

  @Prop({ default: '' }) description!: string;

  @Prop({
    type: String,
    enum: Object.values(DiscountType),
    required: true,
  })
  type!: DiscountType;

  /** % when type=percent (0-100), absolute amount when type=fixed. */
  @Prop({ required: true, min: 0 }) value!: number;

  @Prop({ default: 0, min: 0 }) minSubtotal!: number;

  /** Cap on the discount when type=percent. 0 = no cap. */
  @Prop({ default: 0, min: 0 }) maxDiscount!: number;

  @Prop({ type: Date }) startsAt?: Date;
  @Prop({ type: Date }) expiresAt?: Date;

  /** 0 = unlimited */
  @Prop({ default: 0, min: 0 }) usageLimit!: number;
  @Prop({ default: 0, min: 0 }) usageCount!: number;

  /** 0 = unlimited per user */
  @Prop({ default: 0, min: 0 }) perUserLimit!: number;

  @Prop({ default: true, index: true }) active!: boolean;
}

export const CouponSchema = SchemaFactory.createForClass(Coupon);
