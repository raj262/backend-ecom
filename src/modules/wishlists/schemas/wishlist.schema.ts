import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type WishlistDocument = HydratedDocument<Wishlist>;

/**
 * Per-product snapshot the scanner consults to detect drops. We
 * intentionally don't reuse the `Product.price` field as the baseline
 * — that way an admin who fat-fingers a $99 → $9.99 doesn't trigger a
 * flood of "🎉 76% off!" alerts; the snapshot bakes in the price the
 * user actually saw at the time they added.
 */
@Schema({ _id: false })
export class WishlistEntry {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId!: Types.ObjectId;

  @Prop({ type: Date, default: () => new Date() }) addedAt!: Date;
  @Prop({ type: Number, default: 0 }) priceAtAdd!: number;

  /** Lowest price seen since this entry was added — drives the badge. */
  @Prop({ type: Number, default: 0 }) lowestPriceSeen!: number;

  /** Last price-drop alert we sent (null if never alerted). */
  @Prop({ type: Number, default: null }) lastAlertPrice!: number | null;
  @Prop({ type: Date, default: null }) lastAlertAt!: Date | null;
}

export const WishlistEntrySchema = SchemaFactory.createForClass(WishlistEntry);

@Schema({ timestamps: true, versionKey: false })
export class Wishlist {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  userId!: Types.ObjectId;

  /**
   * Legacy plain product-id array. Kept so older clients can still
   * post `productIds` and read it back — `entries` is the source of
   * truth for price tracking, and `WishlistService` mirrors writes
   * between the two until the next major mobile release drops the
   * compatibility shim.
   */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Product' }], default: [] })
  productIds!: Types.ObjectId[];

  @Prop({ type: [WishlistEntrySchema], default: [] })
  entries!: WishlistEntry[];

  /**
   * Public share token. Generated on demand by `WishlistService.share`
   * (sparse-unique so only wishlists that opted-in have one).
   */
  @Prop({ type: String, default: null, index: true, sparse: true, unique: true })
  shareSlug!: string | null;

  /** Whether the share link is currently active. Toggle without losing slug. */
  @Prop({ default: false }) sharePublic!: boolean;
}

export const WishlistSchema = SchemaFactory.createForClass(Wishlist);
