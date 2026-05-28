import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument, OrderStatus } from '../orders/schemas/order.schema';
import { OrdersService } from '../orders/orders.service';

export type CourierDeliveryTab = 'queue' | 'active' | 'completed';

@Injectable()
export class CourierService {
  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    private readonly orders: OrdersService,
  ) {}

  async listDeliveries(courierId: string, tab: CourierDeliveryTab) {
    const courierOid = this.oid(courierId);
    let filter: Record<string, unknown>;

    switch (tab) {
      case 'queue':
        filter = {
          status: OrderStatus.SHIPPED,
          $or: [
            { assignedCourierId: { $exists: false } },
            { assignedCourierId: null },
          ],
        };
        break;
      case 'active':
        filter = {
          status: OrderStatus.OUT_FOR_DELIVERY,
          assignedCourierId: courierOid,
        };
        break;
      case 'completed':
        filter = {
          status: OrderStatus.DELIVERED,
          assignedCourierId: courierOid,
        };
        break;
      default:
        throw new BadRequestException('Invalid tab');
    }

    const rows = await this.orderModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .limit(tab === 'completed' ? 50 : 100)
      .select(
        '_id orderNumber status total paymentMethod shippingAddress items createdAt updatedAt assignedCourierId',
      )
      .lean()
      .exec();

    return {
      items: rows.map((o) => this.toSummary(o, courierId)),
      tab,
    };
  }

  async getDelivery(courierId: string, orderId: string) {
    const order = await this.requireReadable(courierId, orderId);
    return this.toDetail(order, courierId);
  }

  /** Claim a shipped order and move to out for delivery. */
  async startDelivery(courierId: string, orderId: string) {
    const order = await this.requireOrder(orderId);
    if (order.status !== OrderStatus.SHIPPED) {
      throw new BadRequestException(
        'Only shipped orders can be picked up for delivery',
      );
    }
    if (
      order.assignedCourierId &&
      order.assignedCourierId.toString() !== courierId
    ) {
      throw new ForbiddenException('This delivery is assigned to another courier');
    }

    if (!order.assignedCourierId) {
      order.assignedCourierId = new Types.ObjectId(courierId);
      await order.save();
    }

    const updated = await this.orders.setStatus(orderId, OrderStatus.OUT_FOR_DELIVERY, {
      actor: `courier:${courierId}`,
      note: 'Out for delivery',
    });
    return this.toDetail(updated, courierId);
  }

  /** Mark an active delivery as delivered. */
  async completeDelivery(courierId: string, orderId: string) {
    const order = await this.requireOrder(orderId);
    if (order.status !== OrderStatus.OUT_FOR_DELIVERY) {
      throw new BadRequestException('Order is not out for delivery');
    }
    if (order.assignedCourierId?.toString() !== courierId) {
      throw new ForbiddenException('You are not assigned to this delivery');
    }

    const updated = await this.orders.setStatus(orderId, OrderStatus.DELIVERED, {
      actor: `courier:${courierId}`,
      note: 'Delivered to customer',
    });
    return this.toDetail(updated, courierId);
  }

  private async requireReadable(courierId: string, orderId: string) {
    const order = await this.requireOrder(orderId);
    const cid = order.assignedCourierId?.toString();

    if (order.status === OrderStatus.SHIPPED && !cid) return order;
    if (order.status === OrderStatus.OUT_FOR_DELIVERY && cid === courierId) {
      return order;
    }
    if (order.status === OrderStatus.DELIVERED && cid === courierId) {
      return order;
    }
    throw new ForbiddenException('You do not have access to this delivery');
  }

  private async requireOrder(orderId: string) {
    if (!Types.ObjectId.isValid(orderId)) throw new NotFoundException();
    const order = await this.orderModel.findById(orderId).exec();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private oid(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    return new Types.ObjectId(id);
  }

  private toSummary(
    o: {
      _id: Types.ObjectId;
      orderNumber: string;
      status: OrderStatus;
      total: number;
      paymentMethod: string;
      shippingAddress: Order['shippingAddress'];
      items: { quantity: number }[];
      createdAt?: Date;
      updatedAt?: Date;
      assignedCourierId?: Types.ObjectId;
    },
    courierId: string,
  ) {
    return {
      id: String(o._id),
      orderNumber: o.orderNumber,
      status: o.status,
      total: o.total,
      paymentMethod: o.paymentMethod,
      customerName: o.shippingAddress.fullName,
      city: o.shippingAddress.city,
      phone: o.shippingAddress.phone,
      itemCount: o.items.reduce((n, it) => n + it.quantity, 0),
      assignedToMe: o.assignedCourierId?.toString() === courierId,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    };
  }

  private toDetail(order: OrderDocument, courierId: string) {
    const addr = order.shippingAddress;
    return {
      id: order._id.toString(),
      orderNumber: order.orderNumber,
      status: order.status,
      total: order.total,
      payable: order.payable,
      paymentMethod: order.paymentMethod,
      shippingAddress: addr,
      items: order.items.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        image: it.image,
        color: it.color,
        size: it.size,
      })),
      itemCount: order.items.reduce((n, it) => n + it.quantity, 0),
      assignedToMe: order.assignedCourierId?.toString() === courierId,
      canStart: order.status === OrderStatus.SHIPPED && !order.assignedCourierId,
      canComplete:
        order.status === OrderStatus.OUT_FOR_DELIVERY &&
        order.assignedCourierId?.toString() === courierId,
      createdAt: (order as { createdAt?: Date }).createdAt,
      updatedAt: (order as { updatedAt?: Date }).updatedAt,
    };
  }
}
