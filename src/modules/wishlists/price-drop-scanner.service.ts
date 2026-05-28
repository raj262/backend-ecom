import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QueueService } from '../../queues/queue.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotificationChannel,
  NotificationType,
} from '../notifications/schemas/notification.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Wishlist, WishlistDocument } from './schemas/wishlist.schema';

/**
 * Periodically compares each wishlist entry's snapshot price against
 * the product's current price and pings the owner whenever the price
 * drops by at least `MIN_DROP_PERCENT` (5%). The threshold filters out
 * micro-fluctuations caused by promo-code rounding, currency exchange
 * jitter, etc.
 *
 * Anti-spam rails:
 *   - We only alert if `currentPrice < lastAlertPrice ?? priceAtAdd`
 *     so the same drop never re-fires.
 *   - Honours the `personalizedOffers` push category — users who
 *     muted offer pushes won't get bombarded by sale alerts either.
 */
@Injectable()
export class PriceDropScannerService implements OnModuleInit {
  private readonly logger = new Logger(PriceDropScannerService.name);

  // Minimum percentage drop (relative to baseline) before we ping.
  private static readonly MIN_DROP_PERCENT = 5;

  constructor(
    @InjectModel(Wishlist.name)
    private readonly wishlistModel: Model<WishlistDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
    private readonly queue: QueueService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    this.queue.register('price-drop.scan', async () => {
      // Wrap so the handler resolves to `void` (the queue contract)
      // even though `run()` returns metrics for callers that invoke
      // it directly.
      await this.run();
    });
    const ms = this.intervalMs();
    if (ms > 0) {
      this.queue.schedule(
        'price-drop.scan',
        {},
        { everyMs: ms, name: 'lumiere:price-drop' },
      );
    }
  }

  private intervalMs(): number {
    const raw = this.config.get<string>('PRICE_DROP_SCAN_INTERVAL_MS');
    const n = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? n : 12 * 60 * 60 * 1000; // 12h
  }

  async run(): Promise<{ scanned: number; alerted: number }> {
    // We stream wishlists rather than loading them all into memory.
    const cursor = this.wishlistModel
      .find({ 'entries.0': { $exists: true } })
      .cursor();

    let scanned = 0;
    let alerted = 0;
    for await (const wishlist of cursor) {
      scanned++;
      const productIds = wishlist.entries.map((e) => e.productId);
      if (productIds.length === 0) continue;

      const products = await this.productModel
        .find({ _id: { $in: productIds }, active: true })
        .select('name slug price')
        .lean()
        .exec();
      const priceById = new Map<string, { name: string; slug: string; price: number }>(
        products.map((p) => [
          (p._id as Types.ObjectId).toString(),
          {
            name: p.name as string,
            slug: p.slug as string,
            price: p.price as number,
          },
        ]),
      );

      let entryChanged = false;
      for (const entry of wishlist.entries) {
        const meta = priceById.get(entry.productId.toString());
        if (!meta) continue;

        // Keep the lowest price seen up to date — drives the "X% off
        // since you saved" badge even when we haven't pushed.
        if (meta.price < entry.lowestPriceSeen || entry.lowestPriceSeen === 0) {
          entry.lowestPriceSeen = meta.price;
          entryChanged = true;
        }

        const baseline = entry.lastAlertPrice ?? entry.priceAtAdd;
        if (baseline <= 0) continue;
        const dropPct = ((baseline - meta.price) / baseline) * 100;
        if (dropPct < PriceDropScannerService.MIN_DROP_PERCENT) continue;

        // Fire the alert. We re-use the COUPON notification icon
        // because PRICE_DROP already exists in the type enum and the
        // dispatcher will route it through `personalizedOffers`.
        await this.notifications.create({
          userId: wishlist.userId.toString(),
          type: NotificationType.PRICE_DROP,
          title: `Price drop on ${meta.name}`,
          body: `Now ₹${meta.price.toFixed(2)} — down from ₹${baseline.toFixed(2)} (${Math.round(dropPct)}% off).`,
          href: `/product/${meta.slug}`,
          channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
          pushCategory: 'personalizedOffers',
          data: {
            kind: 'price_drop',
            productId: entry.productId.toString(),
            slug: meta.slug,
            price: meta.price,
            previousPrice: baseline,
          },
        });
        entry.lastAlertPrice = meta.price;
        entry.lastAlertAt = new Date();
        entryChanged = true;
        alerted++;
      }
      if (entryChanged) {
        wishlist.markModified('entries');
        await wishlist.save();
      }
    }
    this.logger.log(
      `Price-drop scan: scanned=${scanned} wishlist${scanned === 1 ? '' : 's'}, alerted=${alerted}`,
    );
    return { scanned, alerted };
  }
}
