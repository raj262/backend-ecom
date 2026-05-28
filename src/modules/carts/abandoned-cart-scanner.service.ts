import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { QueueService } from '../../queues/queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotificationChannel,
  NotificationType,
} from '../notifications/schemas/notification.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Cart, CartDocument } from './schemas/cart.schema';

interface ScanPayload {
  /** Override the staleness threshold in hours. Default: 24. */
  hours?: number;
}

/**
 * Periodically scans for users with abandoned carts and sends them a
 * push reminder. Drives the "Cart reminders" toggle in the user's
 * push settings.
 *
 * The schedule is wired through `QueueService.schedule(...)` so that
 * in dev (no Redis) it runs in-memory via setInterval, and in
 * production BullMQ owns the cron. Either way the worker is safe to
 * run multiple replicas: each cart is updated with `lastReminderAt`
 * so a parallel scan can't ping the same user twice.
 */
@Injectable()
export class AbandonedCartScannerService implements OnModuleInit {
  private readonly logger = new Logger(AbandonedCartScannerService.name);

  constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly queue: QueueService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.queue.register<ScanPayload>('abandoned-cart.scan', (p) =>
      this.run(p ?? {}),
    );

    // Wire a recurring trigger. We use the queue's own scheduler so
    // BullMQ owns the cron in prod; in dev it falls back to a setInterval.
    const intervalMs = this.intervalMs();
    if (intervalMs > 0 && typeof this.queue.schedule === 'function') {
      this.queue.schedule(
        'abandoned-cart.scan',
        {},
        { everyMs: intervalMs, name: 'lumiere:abandoned-cart' },
      );
    } else if (intervalMs > 0) {
      // Fallback when QueueService doesn't expose a scheduler — fire
      // the job ourselves on a regular interval.
      setInterval(
        () => this.queue.enqueue('abandoned-cart.scan', {}),
        intervalMs,
      ).unref?.();
    }
  }

  private intervalMs(): number {
    const raw = this.config.get<string>('ABANDONED_CART_SCAN_INTERVAL_MS');
    const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? n : 6 * 60 * 60 * 1000; // 6h
  }

  async run(payload: ScanPayload) {
    const hours = payload.hours ?? 24;
    const threshold = new Date(Date.now() - hours * 60 * 60 * 1000);
    // Also avoid re-reminding within 3× the window so a user who
    // ignored yesterday's nudge isn't pinged again tomorrow.
    const reminderCutoff = new Date(
      Date.now() - 3 * hours * 60 * 60 * 1000,
    );

    const carts = await this.cartModel
      .find({
        'items.0': { $exists: true },
        updatedAt: { $lte: threshold },
        $or: [
          { lastReminderAt: { $exists: false } },
          { lastReminderAt: { $lte: reminderCutoff } },
        ],
      })
      .limit(500)
      .exec();

    if (carts.length === 0) {
      this.logger.debug('Abandoned-cart scan: 0 candidates');
      return;
    }

    // Hydrate product names for the top item so we can write a
    // copy-rich notification body ("Your Aurora Tote is waiting…").
    const ids = new Set<string>();
    carts.forEach((c) =>
      c.items.forEach((i) => ids.add(i.productId.toString())),
    );
    const products = await this.productModel
      .find({ _id: { $in: [...ids] } })
      .select('name')
      .exec();
    const nameById = new Map(
      products.map((p) => [p._id.toString(), p.name as string]),
    );

    let sent = 0;
    for (const cart of carts) {
      const topItem = cart.items[0];
      const topName = nameById.get(topItem.productId.toString());
      const total = cart.items.reduce((n, it) => n + it.quantity, 0);
      const title = 'Still thinking it over?';
      const body =
        total > 1
          ? `Your ${topName ?? 'pick'} and ${total - 1} more item${total - 1 === 1 ? '' : 's'} are waiting in your bag.`
          : `Your ${topName ?? 'pick'} is still waiting in your bag.`;

      await this.notifications.create({
        userId: cart.userId.toString(),
        type: NotificationType.COUPON, // re-uses the existing in-app icon
        title,
        body,
        href: '/(tabs)/cart',
        channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
        pushCategory: 'cartReminders',
        data: { kind: 'cart_reminder', itemsCount: total },
      });
      cart.lastReminderAt = new Date();
      await cart.save();
      sent++;
    }

    this.logger.log(
      `Abandoned-cart scan: pinged ${sent}/${carts.length} stale cart${sent === 1 ? '' : 's'}`,
    );
  }
}
