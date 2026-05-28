import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QueueService } from '../../queues/queue.service';
import {
  PushPreferences,
  User,
  UserDocument,
} from '../users/schemas/user.schema';
import { NotificationDispatcherService } from './dispatchers/notification-dispatcher.service';
import {
  PushDispatcherService,
  type PushPayload,
} from './dispatchers/push-dispatcher.service';
import {
  Notification,
  NotificationChannel,
  NotificationDocument,
  NotificationType,
} from './schemas/notification.schema';

/** Maps each push category to the user preference key that gates it. */
const PUSH_CATEGORY: Record<NotificationType, keyof PushPreferences | null> = {
  [NotificationType.ORDER_PLACED]: 'orderUpdates',
  [NotificationType.PAYMENT_RECEIVED]: 'orderUpdates',
  [NotificationType.ORDER_SHIPPED]: 'deliveryUpdates',
  [NotificationType.ORDER_DELIVERED]: 'deliveryUpdates',
  [NotificationType.ORDER_CANCELLED]: 'orderUpdates',
  [NotificationType.PRICE_DROP]: 'personalizedOffers',
  [NotificationType.COUPON]: 'flashSales',
  [NotificationType.SYSTEM]: null,
};

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
  channels?: NotificationChannel[];
  data?: Record<string, unknown>;
  /**
   * Override the per-type push category (e.g. an in-app COUPON
   * notification fired by the abandoned-cart scanner needs to gate
   * on `cartReminders`, not `flashSales`).
   */
  pushCategory?: keyof PushPreferences | null;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private readonly notificationModel: Model<NotificationDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    private readonly queue: QueueService,
    private readonly dispatcher: NotificationDispatcherService,
    private readonly push: PushDispatcherService,
  ) {}

  onModuleInit() {
    // Each handler delegates to the integration registry. If the admin
    // hasn't configured a provider yet, the dispatcher logs and no-ops
    // — the queue keeps draining either way.
    this.queue.register<{ to: string; subject: string; html: string; text?: string }>(
      'email.send',
      (p) => this.dispatcher.sendEmail(p),
    );
    this.queue.register<{ to: string; body: string }>('sms.send', (p) =>
      this.dispatcher.sendSms(p),
    );
    this.queue.register<{ to: string; body: string }>('whatsapp.send', (p) =>
      this.dispatcher.sendWhatsapp(p),
    );
    // Single-user push (e.g. order updates).
    this.queue.register<{
      userId: string;
      category: keyof PushPreferences | null;
      payload: Omit<PushPayload, 'to'>;
    }>('push.send', (p) =>
      this.pushToUser(p.userId, p.category, p.payload),
    );
    // Broadcast push (e.g. flash sales) — opts out anyone who's
    // muted the targeted category.
    this.queue.register<{
      category: keyof PushPreferences;
      payload: Omit<PushPayload, 'to'>;
    }>('push.broadcast', (p) =>
      this.pushBroadcast(p.category, p.payload),
    );
  }

  /**
   * Internal helper — call this from other services (orders, payments…)
   * to drop a notification onto a user's feed. Side-channel deliveries
   * (SMS/WA/Email) are enqueued, never blocking the request.
   */
  async create(input: CreateNotificationInput) {
    const channels = input.channels ?? [NotificationChannel.IN_APP];
    const notif = await this.notificationModel.create({
      userId: new Types.ObjectId(input.userId),
      type: input.type,
      title: input.title,
      body: input.body ?? '',
      href: input.href,
      channels,
      data: input.data,
    });

    const body = input.body ?? input.title;
    const pushCategory =
      input.pushCategory !== undefined
        ? input.pushCategory
        : PUSH_CATEGORY[input.type];
    for (const ch of channels) {
      if (ch === NotificationChannel.EMAIL) {
        await this.queue.enqueue('email.send', {
          to: input.userId,
          subject: input.title,
          html: body,
        });
      } else if (ch === NotificationChannel.SMS) {
        await this.queue.enqueue('sms.send', { to: input.userId, body });
      } else if (ch === NotificationChannel.WHATSAPP) {
        await this.queue.enqueue('whatsapp.send', { to: input.userId, body });
      } else if (ch === NotificationChannel.PUSH) {
        await this.queue.enqueue('push.send', {
          userId: input.userId,
          category: pushCategory,
          payload: {
            title: input.title,
            body,
            data: {
              ...(input.data ?? {}),
              ...(input.href ? { url: input.href } : {}),
              notificationId: notif._id.toString(),
              type: input.type,
            },
          },
        });
      }
    }
    return notif;
  }

  // -------------------------------------------------------------------
  // Push routes — invoked by the queue workers above.
  // -------------------------------------------------------------------

  private async pushToUser(
    userId: string,
    category: keyof PushPreferences | null,
    payload: Omit<PushPayload, 'to'>,
  ): Promise<void> {
    if (category) {
      const ok = await this.userAllowsCategory(userId, category);
      if (!ok) return;
    }
    await this.push.sendToUsers([userId], payload);
  }

  private async pushBroadcast(
    category: keyof PushPreferences,
    payload: Omit<PushPayload, 'to'>,
  ): Promise<void> {
    // Find every user who's still opted-in to this category. We
    // deliberately project only `_id` to keep memory bounded for
    // large user bases — the real filtering happens against device
    // tokens by `PushDispatcher.sendToUsers`.
    const cursor = this.userModel
      .find({
        active: true,
        [`pushPreferences.${category}`]: { $ne: false },
      })
      .select('_id')
      .cursor();

    const batch: string[] = [];
    const BATCH = 500;
    let total = { sent: 0, failed: 0 };
    for await (const doc of cursor) {
      batch.push((doc as { _id: Types.ObjectId })._id.toString());
      if (batch.length >= BATCH) {
        const r = await this.push.sendToUsers(batch, payload);
        total = { sent: total.sent + r.sent, failed: total.failed + r.failed };
        batch.length = 0;
      }
    }
    if (batch.length > 0) {
      const r = await this.push.sendToUsers(batch, payload);
      total = { sent: total.sent + r.sent, failed: total.failed + r.failed };
    }
    this.logger.log(
      `Broadcast "${payload.title}" → sent=${total.sent} failed=${total.failed}`,
    );
  }

  private async userAllowsCategory(
    userId: string,
    category: keyof PushPreferences,
  ): Promise<boolean> {
    if (!Types.ObjectId.isValid(userId)) return false;
    const user = await this.userModel
      .findById(userId)
      .select('pushPreferences')
      .exec();
    if (!user) return false;
    const v = user.pushPreferences?.[category];
    // Missing → assume opted in (legacy users predate this field).
    return v !== false;
  }

  /**
   * Public helper used by the flash-sale + personalized-offer
   * endpoints below. Wraps `push.broadcast` so the dispatch never
   * blocks the HTTP request that scheduled it.
   */
  async broadcastPush(
    category: keyof PushPreferences,
    payload: Omit<PushPayload, 'to'>,
  ) {
    await this.queue.enqueue('push.broadcast', { category, payload });
    return { queued: true };
  }

  async listForUser(
    userId: string,
    opts: { unreadOnly?: boolean; limit?: number } = {},
  ) {
    const filter: Record<string, unknown> = {
      userId: new Types.ObjectId(userId),
    };
    if (opts.unreadOnly) filter.read = false;
    return this.notificationModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(opts.limit ?? 50)
      .exec();
  }

  unreadCount(userId: string) {
    return this.notificationModel
      .countDocuments({
        userId: new Types.ObjectId(userId),
        read: false,
      })
      .exec();
  }

  async markRead(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const updated = await this.notificationModel
      .findOneAndUpdate(
        { _id: id, userId: new Types.ObjectId(userId) },
        { $set: { read: true, readAt: new Date() } },
        { new: true },
      )
      .exec();
    if (!updated) throw new NotFoundException('Notification not found');
    return updated;
  }

  async markAllRead(userId: string) {
    const res = await this.notificationModel
      .updateMany(
        { userId: new Types.ObjectId(userId), read: false },
        { $set: { read: true, readAt: new Date() } },
      )
      .exec();
    return { updated: res.modifiedCount };
  }

  async remove(userId: string, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const res = await this.notificationModel
      .deleteOne({ _id: id, userId: new Types.ObjectId(userId) })
      .exec();
    if (res.deletedCount === 0) throw new NotFoundException();
    return { ok: true };
  }
}
