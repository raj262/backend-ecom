import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Inventory, InventoryDocument } from './schemas/inventory.schema';

@Injectable()
export class InventoryService {
  constructor(
    @InjectModel(Inventory.name)
    private readonly inv: Model<InventoryDocument>,
  ) {}

  list(productId?: string) {
    const filter: Record<string, unknown> = {};
    if (productId && Types.ObjectId.isValid(productId)) {
      filter.productId = new Types.ObjectId(productId);
    }
    return this.inv.find(filter).sort({ updatedAt: -1 }).exec();
  }

  async adjust(args: {
    productId: string;
    sku: string;
    delta: number;
    warehouse?: string;
  }) {
    if (!Types.ObjectId.isValid(args.productId)) {
      throw new BadRequestException('Invalid productId');
    }
    const filter = {
      productId: new Types.ObjectId(args.productId),
      sku: args.sku,
      warehouse: args.warehouse ?? 'default',
    };
    const updated = await this.inv
      .findOneAndUpdate(
        filter,
        { $inc: { quantity: args.delta }, $setOnInsert: filter },
        { new: true, upsert: true },
      )
      .exec();
    if (updated.quantity < 0) {
      // Roll back the negative stock and reject.
      await this.inv
        .updateOne(filter, { $inc: { quantity: -args.delta } })
        .exec();
      throw new BadRequestException('Insufficient stock for this adjustment');
    }
    return updated;
  }

  async reserve(productId: string, sku: string, qty: number) {
    const row = await this.inv.findOne({
      productId: new Types.ObjectId(productId),
      sku,
    });
    if (!row) throw new NotFoundException('No stock row for this SKU');
    if (row.quantity - row.reserved < qty) {
      throw new BadRequestException('Not enough stock to reserve');
    }
    row.reserved += qty;
    await row.save();
    return row;
  }
}
