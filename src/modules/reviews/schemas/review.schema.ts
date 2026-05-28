import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

@Schema({ timestamps: true, versionKey: false })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  // Denormalized so a review can render without an extra populate.
  @Prop({ required: true }) userName!: string;
  @Prop() userAvatarUrl?: string;

  @Prop({ required: true, min: 1, max: 5 }) rating!: number;
  @Prop({ trim: true }) title?: string;
  @Prop({ required: true, trim: true }) body!: string;

  @Prop({ default: false, index: true })
  verifiedPurchase!: boolean;

  /**
   * Counter is denormalized so listing endpoints don't have to do a
   * `voters.length`. Always kept in sync with `voters` inside the service.
   */
  @Prop({ default: 0 }) helpful!: number;

  /** Users who upvoted as helpful. Prevents double-counting. */
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] })
  voters!: Types.ObjectId[];

  /** Customer-uploaded images / short video URLs (≤6). */
  @Prop({ type: [String], default: [] })
  media!: string[];
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// One review per user per product.
ReviewSchema.index({ productId: 1, userId: 1 }, { unique: true });
