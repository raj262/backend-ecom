import { Injectable } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationType,
} from '../../notifications/schemas/notification.schema';
import { NotificationsService } from '../../notifications/notifications.service';
import { OrderDocument, OrderStatus } from '../schemas/order.schema';

const TITLES: Partial<Record<OrderStatus, string>> = {
  [OrderStatus.PENDING]: 'Order #{n} placed',
  [OrderStatus.PAID]: 'Payment received for order #{n}',
  [OrderStatus.PROCESSING]: 'Order #{n} is being prepared',
  [OrderStatus.PACKED]: 'Order #{n} packed',
  [OrderStatus.SHIPPED]: 'Order #{n} shipped',
  [OrderStatus.OUT_FOR_DELIVERY]: 'Order #{n} out for delivery',
  [OrderStatus.DELIVERED]: 'Order #{n} delivered',
  [OrderStatus.CANCELLED]: 'Order #{n} cancelled',
  [OrderStatus.RETURNED]: 'Order #{n} returned',
};

const TYPES: Partial<Record<OrderStatus, NotificationType>> = {
  [OrderStatus.PENDING]: NotificationType.ORDER_PLACED,
  [OrderStatus.SHIPPED]: NotificationType.ORDER_SHIPPED,
  [OrderStatus.DELIVERED]: NotificationType.ORDER_DELIVERED,
  [OrderStatus.CANCELLED]: NotificationType.ORDER_CANCELLED,
};

/**
 * Centralises the "order changed → user gets a ping" mapping. Keeps the
 * status→message table in one place so adding a status only requires
 * touching this file (plus the enum + flow).
 */
@Injectable()
export class OrderNotifierService {
  constructor(private readonly notifications: NotificationsService) {}

  async notifyStatusChange(order: OrderDocument) {
    const template = TITLES[order.status];
    if (!template) return;
    await this.notifications.create({
      userId: order.userId.toString(),
      type: TYPES[order.status] ?? NotificationType.ORDER_PLACED,
      title: template.replace('#{n}', order.orderNumber),
      href: `/orders/${order._id.toString()}`,
      channels: this.channels(order),
      data: { orderId: order._id.toString(), total: order.total },
    });
  }

  async notifyPlaced(order: OrderDocument) {
    await this.notifications.create({
      userId: order.userId.toString(),
      type: NotificationType.ORDER_PLACED,
      title: `Order ${order.orderNumber} placed`,
      body: `Your order for ${order.items.length} item${order.items.length === 1 ? '' : 's'} is confirmed.`,
      href: `/orders/${order._id.toString()}`,
      channels: this.channels(order),
      data: { orderId: order._id.toString(), total: order.total },
    });
  }

  /**
   * Default channels for an order touchpoint:
   *   - IN_APP — always (drives the bell + badge in the app)
   *   - PUSH   — always (the customer can opt out per-category in
   *              settings; the dispatcher honours that flag)
   *   - SMS / WhatsApp — only if the customer opted in at checkout
   */
  private channels(order: OrderDocument): NotificationChannel[] {
    return [
      NotificationChannel.IN_APP,
      NotificationChannel.PUSH,
      ...(order.notifySms ? [NotificationChannel.SMS] : []),
      ...(order.notifyWhatsapp ? [NotificationChannel.WHATSAPP] : []),
    ];
  }
}
