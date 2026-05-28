import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProductDocument = HydratedDocument<Product>;

@Schema({ _id: false })
export class Variant {
  @Prop() color?: string;
  @Prop() size?: string;
  @Prop({ default: 0 }) stock?: number;
  @Prop() sku?: string;
}

export const VariantSchema = SchemaFactory.createForClass(Variant);

@Schema({ _id: false })
export class SeoMeta {
  @Prop() title?: string;
  @Prop() description?: string;
  @Prop({ type: [String], default: [] }) keywords!: string[];
  @Prop() canonicalUrl?: string;
  @Prop() ogImage?: string;
}
export const SeoMetaSchema = SchemaFactory.createForClass(SeoMeta);

@Schema({ _id: false })
export class ProductAttribute {
  @Prop({ required: true }) name!: string;
  @Prop({ required: true }) value!: string;
}
export const ProductAttributeSchema =
  SchemaFactory.createForClass(ProductAttribute);

@Schema({ timestamps: true, versionKey: false })
export class Product {
  @Prop({ required: true, trim: true, index: 'text' })
  name!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true, index: true })
  slug!: string;

  @Prop({ default: '' }) description!: string;

  @Prop({ required: true, min: 0 }) price!: number;
  @Prop({ min: 0 }) oldPrice?: number;

  @Prop({ type: [String], default: [] }) images!: string[];

  @Prop({ required: true, index: true }) category!: string;
  @Prop({ required: true, index: true }) brand!: string;

  @Prop({ type: [String], default: [] }) colors!: string[];
  @Prop({ type: [String], default: [] }) sizes!: string[];

  @Prop({ default: 0, min: 0, max: 5 }) rating!: number;
  @Prop({ default: 0, min: 0 }) reviewCount!: number;

  @Prop({ default: 0, min: 0 }) stock!: number;

  @Prop({ default: false, index: true }) isFeatured!: boolean;
  @Prop({ default: false, index: true }) isNew!: boolean;
  @Prop({ default: false, index: true }) onSale!: boolean;

  @Prop({ type: [VariantSchema], default: [] }) variants!: Variant[];

  @Prop({ type: [ProductAttributeSchema], default: [] })
  attributes!: ProductAttribute[];

  /** AI-curated tags. Refreshed by the `ai` module; not user-editable. */
  @Prop({ type: [String], default: [], index: true })
  aiTags!: string[];

  @Prop({ type: SeoMetaSchema, default: () => ({}) })
  seo!: SeoMeta;

  /** Increments on view; orders boost it more. Used by "popular" sort. */
  @Prop({ default: 0, index: true }) popularity!: number;

  @Prop({ default: true, index: true }) active!: boolean;

  /**
   * Vendor that owns this product. Null = platform-owned (admin-managed).
   * Vendors can only mutate products where `vendorId === their userId`.
   */
  @Prop({ type: Types.ObjectId, ref: 'User', default: null, index: true })
  vendorId!: Types.ObjectId | null;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({
  name: 'text',
  description: 'text',
  brand: 'text',
  'seo.keywords': 'text',
  aiTags: 'text',
});
