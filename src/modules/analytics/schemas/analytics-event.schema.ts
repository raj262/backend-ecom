import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type AnalyticsEventDocument = HydratedDocument<AnalyticsEvent>;

/**
 * Closed list of tracked event types. Add a value here before instrumenting
 * the storefront — keeps the analytics surface auditable.
 */
export enum AnalyticsEventType {
  PRODUCT_VIEW = 'product_view',
  PRODUCT_SEARCH = 'product_search',
  ADD_TO_CART = 'add_to_cart',
  REMOVE_FROM_CART = 'remove_from_cart',
  CHECKOUT_START = 'checkout_start',
  CHECKOUT_ABANDON = 'checkout_abandon',
  ORDER_PLACED = 'order_placed',
  ORDER_PAID = 'order_paid',
  WISHLIST_ADD = 'wishlist_add',
  PAGE_VIEW = 'page_view',
}

@Schema({ timestamps: true, versionKey: false })
export class AnalyticsEvent {
  @Prop({
    type: String,
    enum: Object.values(AnalyticsEventType),
    required: true,
    index: true,
  })
  type!: AnalyticsEventType;

  /** Anonymous storefront session id (cookie). Always present. */
  @Prop({ required: true, index: true })
  sessionId!: string;

  /** Logged-in user (null for anonymous traffic). */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  userId!: Types.ObjectId | null;

  /** Subject of the event when applicable (e.g. product viewed). */
  @Prop({ type: Types.ObjectId, default: null, index: true })
  targetId!: Types.ObjectId | null;

  @Prop({ type: Object, default: {} })
  data!: Record<string, unknown>;

  @Prop() referer?: string;
  @Prop() userAgent?: string;
}

export const AnalyticsEventSchema =
  SchemaFactory.createForClass(AnalyticsEvent);

AnalyticsEventSchema.index({ type: 1, createdAt: -1 });
AnalyticsEventSchema.index({ sessionId: 1, createdAt: -1 });
