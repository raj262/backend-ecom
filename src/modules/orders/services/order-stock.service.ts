import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from '../../products/schemas/product.schema';

export interface ReservedLine {
  productId: Types.ObjectId;
  quantity: number;
}

/**
 * Owns the overselling guard. Atomic, narrowly-scoped, easy to wrap in a
 * transaction later. `OrdersService` calls in here without knowing how
 * stock is actually tracked (today: `Product.stock`; tomorrow: maybe
 * the per-warehouse Inventory ledger).
 */
@Injectable()
export class OrderStockService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  /**
   * Decrement stock for every line atomically. If any line is short, the
   * decrements made earlier in this call are reversed and we throw. The
   * returned array is what `release` expects.
   */
  async reserve(lines: ReservedLine[]): Promise<ReservedLine[]> {
    const applied: ReservedLine[] = [];
    for (const line of lines) {
      const res = await this.productModel
        .updateOne(
          { _id: line.productId, stock: { $gte: line.quantity } },
          { $inc: { stock: -line.quantity } },
        )
        .exec();
      if (!res.modifiedCount) {
        await this.release(applied);
        throw new BadRequestException('Insufficient stock for one or more items');
      }
      applied.push(line);
    }
    return applied;
  }

  async release(lines: ReservedLine[]): Promise<void> {
    if (!lines.length) return;
    await Promise.all(
      lines.map((l) =>
        this.productModel
          .updateOne({ _id: l.productId }, { $inc: { stock: l.quantity } })
          .exec(),
      ),
    );
  }
}
