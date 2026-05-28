import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type InventoryDocument = HydratedDocument<Inventory>;

/**
 * Per-SKU stock ledger. A product has one row per warehouse so we can
 * extend to multi-warehouse fulfilment without changing the API surface.
 *
 *   available = quantity - reserved
 */
@Schema({ timestamps: true })
export class Inventory {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId!: Types.ObjectId;

  @Prop({ required: true, index: true })
  sku!: string;

  @Prop({ default: 'default' })
  warehouse!: string;

  @Prop({ default: 0, min: 0 })
  quantity!: number;

  @Prop({ default: 0, min: 0 })
  reserved!: number;

  @Prop({ default: 5, min: 0 })
  lowStockThreshold!: number;
}

export const InventorySchema = SchemaFactory.createForClass(Inventory);

InventorySchema.index({ productId: 1, warehouse: 1, sku: 1 }, { unique: true });

InventorySchema.virtual('available').get(function (this: Inventory) {
  return Math.max(0, this.quantity - this.reserved);
});
