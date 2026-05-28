import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument, OrderStatus } from '../orders/schemas/order.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { round2 } from '../../utils/money';

const PAID_STATUSES = [
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.PACKED,
  OrderStatus.SHIPPED,
  OrderStatus.OUT_FOR_DELIVERY,
  OrderStatus.DELIVERED,
];

@Injectable()
export class VendorService {
  constructor(
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
  ) {}

  async dashboard(vendorId: string) {
    const vendorOid = this.oid(vendorId);
    const productIds = await this.vendorProductIds(vendorOid);

    const [productCount, lowStock, orders] = await Promise.all([
      this.productModel.countDocuments({ vendorId: vendorOid, active: true }),
      this.productModel.countDocuments({
        vendorId: vendorOid,
        active: true,
        stock: { $lte: 5, $gt: 0 },
      }),
      productIds.length
        ? this.orderModel
            .find({ 'items.productId': { $in: productIds } })
            .select('items status total')
            .exec()
        : Promise.resolve([]),
    ]);

    const vendorOrders = orders.filter((o) =>
      o.items.some((it) => productIds.some((id) => id.equals(it.productId))),
    );

    const pendingOrders = vendorOrders.filter(
      (o) =>
        o.status === OrderStatus.PAID ||
        o.status === OrderStatus.PROCESSING ||
        o.status === OrderStatus.PACKED,
    ).length;

    const earnings = this.sumVendorLineRevenue(vendorOrders, productIds);

    return {
      productCount,
      lowStock,
      orderCount: vendorOrders.length,
      pendingOrders,
      earnings,
      currency: 'INR' as const,
    };
  }

  async listOrders(vendorId: string, page = 1, limit = 20) {
    const vendorOid = this.oid(vendorId);
    const productIds = await this.vendorProductIds(vendorOid);
    if (!productIds.length) {
      return { items: [], total: 0, page, limit, totalPages: 0 };
    }

    const skip = (Math.max(1, page) - 1) * limit;
    const filter = { 'items.productId': { $in: productIds } };

    const [rows, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id orderNumber status total items createdAt')
        .lean()
        .exec(),
      this.orderModel.countDocuments(filter),
    ]);

    const items = rows.map((o) => {
      const vendorItems = o.items.filter((it) =>
        productIds.some((id) => id.equals(it.productId)),
      );
      const subtotal = vendorItems.reduce(
        (sum, it) => sum + it.price * it.quantity,
        0,
      );
      return {
        id: String(o._id),
        orderNumber: o.orderNumber,
        status: o.status,
        vendorSubtotal: round2(subtotal),
        itemCount: vendorItems.reduce((n, it) => n + it.quantity, 0),
        createdAt: (o as { createdAt?: Date }).createdAt,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 0,
    };
  }

  async earnings(vendorId: string) {
    const vendorOid = this.oid(vendorId);
    const productIds = await this.vendorProductIds(vendorOid);
    if (!productIds.length) {
      return {
        total: 0,
        paid: 0,
        pending: 0,
        currency: 'INR' as const,
      };
    }

    const orders = await this.orderModel
      .find({ 'items.productId': { $in: productIds } })
      .select('items status')
      .exec();

    const paid = this.sumVendorLineRevenue(
      orders.filter((o) => PAID_STATUSES.includes(o.status)),
      productIds,
    );
    const pending = this.sumVendorLineRevenue(
      orders.filter((o) => o.status === OrderStatus.PENDING),
      productIds,
    );

    return {
      total: round2(paid + pending),
      paid,
      pending,
      currency: 'INR' as const,
    };
  }

  private sumVendorLineRevenue(
    orders: Pick<OrderDocument, 'items'>[],
    productIds: Types.ObjectId[],
  ) {
    let sum = 0;
    for (const order of orders) {
      for (const item of order.items) {
        if (productIds.some((id) => id.equals(item.productId))) {
          sum += item.price * item.quantity;
        }
      }
    }
    return round2(sum);
  }

  private async vendorProductIds(vendorOid: Types.ObjectId) {
    return this.productModel.distinct('_id', { vendorId: vendorOid });
  }

  private oid(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    return new Types.ObjectId(id);
  }
}
