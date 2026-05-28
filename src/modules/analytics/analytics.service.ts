import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QueueService } from '../../queues/queue.service';
import { Order, OrderDocument, OrderStatus } from '../orders/schemas/order.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  AnalyticsEvent,
  AnalyticsEventDocument,
  AnalyticsEventType,
} from './schemas/analytics-event.schema';

export interface TrackEventPayload {
  type: AnalyticsEventType;
  sessionId: string;
  userId?: string | null;
  targetId?: string | null;
  data?: Record<string, unknown>;
  referer?: string;
  userAgent?: string;
}

@Injectable()
export class AnalyticsService implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @InjectModel(Order.name) private readonly orders: Model<OrderDocument>,
    @InjectModel(Product.name) private readonly products: Model<ProductDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    @InjectModel(AnalyticsEvent.name)
    private readonly events: Model<AnalyticsEventDocument>,
    private readonly queue: QueueService,
  ) {}

  onModuleInit() {
    this.queue.register<TrackEventPayload>('analytics.event', (p) =>
      this.recordEvent(p),
    );
  }

  /**
   * Single roll-up the admin dashboard consumes. Pulls counts + revenue +
   * recent activity in one round-trip so the UI doesn't fan out to N
   * endpoints on first paint.
   */
  async overview() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      orderCount,
      productCount,
      userCount,
      revenueAgg,
      recentOrders,
      lowStockProducts,
      ordersByStatus,
      topProducts,
      conversionAgg,
    ] = await Promise.all([
      this.orders.countDocuments().exec(),
      this.products.countDocuments({ active: true }).exec(),
      this.users.countDocuments().exec(),
      this.orders
        .aggregate<{ _id: null; total: number }>([
          {
            $match: {
              status: { $nin: [OrderStatus.CANCELLED, OrderStatus.RETURNED] },
              createdAt: { $gte: thirtyDaysAgo },
            },
          },
          { $group: { _id: null, total: { $sum: '$total' } } },
        ])
        .exec(),
      this.orders.find().sort({ createdAt: -1 }).limit(5).exec(),
      this.products
        .find({ stock: { $lte: 5 }, active: true })
        .sort({ stock: 1 })
        .limit(5)
        .exec(),
      this.orders
        .aggregate<{ _id: OrderStatus; count: number }>([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
      this.events
        .aggregate<{ _id: Types.ObjectId; views: number }>([
          {
            $match: {
              type: AnalyticsEventType.PRODUCT_VIEW,
              createdAt: { $gte: sevenDaysAgo },
              targetId: { $ne: null },
            },
          },
          { $group: { _id: '$targetId', views: { $sum: 1 } } },
          { $sort: { views: -1 } },
          { $limit: 5 },
        ])
        .exec(),
      this.events
        .aggregate<{ _id: AnalyticsEventType; count: number }>([
          {
            $match: {
              createdAt: { $gte: sevenDaysAgo },
              type: {
                $in: [
                  AnalyticsEventType.PRODUCT_VIEW,
                  AnalyticsEventType.ADD_TO_CART,
                  AnalyticsEventType.CHECKOUT_START,
                  AnalyticsEventType.ORDER_PLACED,
                ],
              },
            },
          },
          { $group: { _id: '$type', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    return {
      counts: { orders: orderCount, products: productCount, users: userCount },
      revenue30d: revenueAgg[0]?.total ?? 0,
      recentOrders,
      lowStockProducts,
      ordersByStatus,
      topProducts,
      funnel7d: this.buildFunnel(conversionAgg),
    };
  }

  /**
   * Public beacon — called by the storefront. Returns immediately; the
   * actual Mongo write happens on the BullMQ worker (or inline in dev).
   * This keeps the beacon under a few millis even if Mongo is slow.
   */
  async track(payload: TrackEventPayload): Promise<void> {
    await this.queue.enqueue('analytics.event', payload);
  }

  /** Queue worker: persist the event. Idempotent enough for at-least-once. */
  async recordEvent(input: TrackEventPayload): Promise<void> {
    try {
      await this.events.create({
        type: input.type,
        sessionId: input.sessionId,
        userId:
          input.userId && Types.ObjectId.isValid(input.userId)
            ? new Types.ObjectId(input.userId)
            : null,
        targetId:
          input.targetId && Types.ObjectId.isValid(input.targetId)
            ? new Types.ObjectId(input.targetId)
            : null,
        data: input.data ?? {},
        referer: input.referer,
        userAgent: input.userAgent,
      });
    } catch (err) {
      this.logger.error('Failed to persist analytics event', err as Error);
      throw err;
    }
  }

  /**
   * Sessions that hit checkout-start in the last day but never hit
   * order-placed. Used by the abandoned-cart reminder job.
   */
  async abandonedCarts(since = new Date(Date.now() - 24 * 60 * 60 * 1000)) {
    return this.events
      .aggregate<{ _id: string; lastSeen: Date; userId: Types.ObjectId | null }>([
        {
          $match: {
            createdAt: { $gte: since },
            type: {
              $in: [
                AnalyticsEventType.CHECKOUT_START,
                AnalyticsEventType.ORDER_PLACED,
              ],
            },
          },
        },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$sessionId',
            types: { $addToSet: '$type' },
            lastSeen: { $max: '$createdAt' },
            userId: { $first: '$userId' },
          },
        },
        {
          $match: {
            types: AnalyticsEventType.CHECKOUT_START,
            'types.1': { $exists: false },
          },
        },
        { $limit: 100 },
      ])
      .exec();
  }

  private buildFunnel(
    rows: Array<{ _id: AnalyticsEventType; count: number }>,
  ): Record<AnalyticsEventType, number> {
    const map: Partial<Record<AnalyticsEventType, number>> = {};
    for (const r of rows) map[r._id] = r.count;
    return {
      [AnalyticsEventType.PRODUCT_VIEW]: map[AnalyticsEventType.PRODUCT_VIEW] ?? 0,
      [AnalyticsEventType.PRODUCT_SEARCH]:
        map[AnalyticsEventType.PRODUCT_SEARCH] ?? 0,
      [AnalyticsEventType.ADD_TO_CART]: map[AnalyticsEventType.ADD_TO_CART] ?? 0,
      [AnalyticsEventType.REMOVE_FROM_CART]:
        map[AnalyticsEventType.REMOVE_FROM_CART] ?? 0,
      [AnalyticsEventType.CHECKOUT_START]:
        map[AnalyticsEventType.CHECKOUT_START] ?? 0,
      [AnalyticsEventType.CHECKOUT_ABANDON]:
        map[AnalyticsEventType.CHECKOUT_ABANDON] ?? 0,
      [AnalyticsEventType.ORDER_PLACED]: map[AnalyticsEventType.ORDER_PLACED] ?? 0,
      [AnalyticsEventType.ORDER_PAID]: map[AnalyticsEventType.ORDER_PAID] ?? 0,
      [AnalyticsEventType.WISHLIST_ADD]: map[AnalyticsEventType.WISHLIST_ADD] ?? 0,
      [AnalyticsEventType.PAGE_VIEW]: map[AnalyticsEventType.PAGE_VIEW] ?? 0,
    };
  }
}
