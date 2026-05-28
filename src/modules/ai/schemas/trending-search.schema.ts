import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TrendingSearchDocument = HydratedDocument<TrendingSearch>;

/**
 * One document per normalized query (lowercased, trimmed). We bump
 * `count` and `lastSearchedAt` on every committed search; the trending
 * list is the top-N by count over a rolling window.
 *
 * Index strategy:
 *  - unique on `term` so the upsert path is cheap
 *  - desc on `count` (+ desc on `lastSearchedAt` as tie-breaker) so
 *    trending lookups are a sorted index scan
 */
@Schema({ timestamps: true, collection: 'trending_searches' })
export class TrendingSearch {
  @Prop({ required: true, unique: true, index: true })
  term!: string;

  /** Cosmetic casing — what we render in chips. */
  @Prop({ required: true })
  display!: string;

  @Prop({ type: Number, default: 0, index: true })
  count!: number;

  @Prop({ type: Date, default: () => new Date() })
  lastSearchedAt!: Date;
}

export const TrendingSearchSchema = SchemaFactory.createForClass(TrendingSearch);
TrendingSearchSchema.index({ count: -1, lastSearchedAt: -1 });
