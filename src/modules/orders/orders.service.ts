import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QueueService } from '../../queues/queue.service';
import { orderNumber as makeOrderNumber } from '../../utils/ids';
import { CouponsService } from '../coupons/coupons.service';
import { PaymentsService } from '../payments/payments.service';
import { PaymentProvider } from '../payments/schemas/payment.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { WalletEntryReason } from '../wallet/schemas/wallet-ledger.schema';
import { WalletService } from '../wallet/wallet.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateReturnDto } from './dto/create-return.dto';
import { DecideReturnDto } from './dto/decide-return.dto';
import {
  ORDER_STATUS_FLOW,
  Order,
  OrderDocument,
  OrderStatus,
  PaymentMethod,
  ReturnStatus,
} from './schemas/order.schema';
import { OrderNotifierService } from './services/order-notifier.service';
import { OrderPricingService } from './services/order-pricing.service';
import { OrderStockService } from './services/order-stock.service';

/**
 * Orchestrator — composes pricing, stock, payment, notification, coupon
 * subsystems. Stays slim by delegating any non-orchestration logic to a
 * dedicated service in `./services/`.
 */
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    private readonly pricing: OrderPricingService,
    private readonly stock: OrderStockService,
    private readonly notifier: OrderNotifierService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly payments: PaymentsService,
    private readonly coupons: CouponsService,
    private readonly wallet: WalletService,
    private readonly queue: QueueService,
  ) {}

  async create(userId: string, dto: CreateOrderDto) {
    const products = await this.loadActiveProducts(dto);

    // Pre-flight wallet balance — the pricing engine clamps the
    // requested wallet amount against this value.
    const { balance: walletBalance } = await this.wallet.getBalance(userId);
    const priced = await this.pricing.build(dto, products, walletBalance);

    const reservation = await this.stock.reserve(
      priced.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    );

    let walletDebited = false;
    try {
      // Debit the wallet BEFORE we mint the order: the conditional
      // findOneAndUpdate in WalletService guards against races. If the
      // debit fails we never reserved a real charge.
      if (priced.walletAmount > 0) {
        await this.wallet.debit({
          userId,
          amount: priced.walletAmount,
          reason: WalletEntryReason.ORDER_PAYMENT,
          note: 'Wallet applied to order',
        });
        walletDebited = true;
      }

      const initialStatus =
        priced.payable === 0 ? OrderStatus.PAID : OrderStatus.PENDING;
      const now = new Date();

      const order = await this.orderModel.create({
        userId: new Types.ObjectId(userId),
        orderNumber: makeOrderNumber(),
        items: priced.items,
        shippingAddress: dto.shippingAddress,
        paymentMethod: dto.paymentMethod,
        subtotal: priced.subtotal,
        shippingFee: priced.shippingFee,
        codFee: priced.codFee,
        discount: priced.discount,
        tax: priced.tax,
        total: priced.total,
        walletAmount: priced.walletAmount,
        payable: priced.payable,
        upiVpa:
          dto.paymentMethod === PaymentMethod.UPI ? dto.upiVpa : undefined,
        couponCode: dto.couponCode,
        notifyWhatsapp: dto.notifyWhatsapp ?? false,
        notifySms: dto.notifySms ?? false,
        // If wallet covers the whole bill there's nothing left to
        // collect — short-circuit straight to PAID so downstream
        // (notifications, invoice) fires immediately.
        status: initialStatus,
        events: [
          {
            status: initialStatus,
            at: now,
            actor: 'customer',
            note:
              initialStatus === OrderStatus.PAID
                ? 'Order placed — fully covered by wallet'
                : 'Order placed',
          },
        ],
      });

      const provider =
        dto.paymentMethod === PaymentMethod.COD
          ? PaymentProvider.CASH_ON_DELIVERY
          : PaymentProvider.MOCK;

      await Promise.all([
        this.payments.createForOrder({
          orderId: order._id.toString(),
          userId,
          amount: priced.payable,
          provider,
        }),
        this.notifier.notifyPlaced(order),
        dto.couponCode
          ? this.coupons.markRedeemed(dto.couponCode)
          : Promise.resolve(),
        // Tax invoice is a legal record — issue it for every order at
        // creation, not just at payment capture. The COD flow doesn't
        // go through `markPaid`, so without this customers would never
        // get an invoice number for cash orders.
        this.queue.enqueue('invoice.generate', {
          orderId: order._id.toString(),
        }),
      ]);

      return order;
    } catch (err) {
      await this.stock
        .release(reservation)
        .catch((e) =>
          this.logger.error('Stock release after failure failed', e as Error),
        );
      if (walletDebited) {
        // Roll back the wallet debit so the customer's balance isn't
        // burned by a failed write.
        await this.wallet
          .credit({
            userId,
            amount: priced.walletAmount,
            reason: WalletEntryReason.ORDER_REFUND,
            note: 'Auto-refund: order creation failed',
          })
          .catch((e) =>
            this.logger.error('Wallet rollback failed', e as Error),
          );
      }
      throw err;
    }
  }

  // --- Reads ---------------------------------------------------------

  listForUser(userId: string) {
    return this.orderModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(userId: string, id: string) {
    const order = await this.requireOrder(id);
    if (order.userId.toString() !== userId) {
      throw new ForbiddenException('Not your order');
    }
    return order;
  }

  // --- Admin ---------------------------------------------------------

  async listAll(opts: { page: number; limit: number; status?: OrderStatus }) {
    const { page, limit, status } = opts;
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    const [items, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.orderModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async setStatus(
    id: string,
    next: OrderStatus,
    extras?: {
      tracking?: { carrier?: string; code?: string; url?: string };
      actor?: string;
      note?: string;
    },
  ) {
    const order = await this.requireOrder(id);
    this.assertCanTransition(order.status, next);

    order.status = next;
    if (next === OrderStatus.DELIVERED) order.deliveredAt = new Date();
    if (next === OrderStatus.CANCELLED) {
      order.cancelledAt = new Date();
      await this.stock.release(this.linesOf(order));
      await this.refundWalletIfAny(order);
    }
    if (next === OrderStatus.SHIPPED && extras?.tracking) {
      order.tracking = {
        ...(order.tracking ?? {}),
        ...extras.tracking,
        shippedAt: new Date(),
      };
    }
    this.recordEvent(order, next, extras?.actor ?? 'admin', extras?.note);
    await order.save();
    await this.notifier.notifyStatusChange(order);
    return order;
  }

  async cancel(userId: string, id: string) {
    const order = await this.findOne(userId, id);
    this.assertCanTransition(order.status, OrderStatus.CANCELLED);

    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();
    this.recordEvent(
      order,
      OrderStatus.CANCELLED,
      'customer',
      'Cancelled by customer',
    );
    await order.save();
    await this.stock.release(this.linesOf(order));
    await this.refundWalletIfAny(order);
    await this.notifier.notifyStatusChange(order);
    return order;
  }

  // --- Reorder -------------------------------------------------------

  /**
   * Build a fresh order draft from a past order by re-validating every
   * line against the current catalog. Items the customer can still buy
   * are returned in `items`; anything that's been delisted, discontinued
   * or is now out of stock is surfaced under `unavailable` so the
   * client can show a "Skipped X items" banner.
   */
  async buildReorderDraft(userId: string, id: string) {
    const order = await this.findOne(userId, id);

    const productIds = order.items.map((i) => i.productId);
    const products = await this.productModel
      .find({ _id: { $in: productIds } })
      .exec();
    const byId = new Map(products.map((p) => [p._id.toString(), p]));

    type Item = {
      productId: string;
      name: string;
      slug: string;
      image: string;
      quantity: number;
      price: number;
      color?: string;
      size?: string;
    };
    const items: Item[] = [];
    const unavailable: Array<{
      productId: string;
      name: string;
      reason: string;
    }> = [];

    for (const line of order.items) {
      const p = byId.get(line.productId.toString());
      if (!p || !p.active) {
        unavailable.push({
          productId: line.productId.toString(),
          name: line.name,
          reason: 'No longer available',
        });
        continue;
      }
      const stock = p.stock ?? 0;
      if (stock <= 0) {
        unavailable.push({
          productId: line.productId.toString(),
          name: line.name,
          reason: 'Out of stock',
        });
        continue;
      }
      items.push({
        productId: line.productId.toString(),
        name: p.name,
        slug: p.slug,
        image: p.images?.[0] ?? line.image,
        quantity: Math.min(line.quantity, stock),
        price: p.price,
        color: line.color,
        size: line.size,
      });
    }

    return { items, unavailable };
  }

  // --- Return requests ----------------------------------------------

  /**
   * Customer-initiated return. We enforce:
   *   - the order belongs to the caller
   *   - it has been delivered
   *   - we're inside the return window (default 7 days)
   *   - no existing open/approved return already
   *   - each requested line exists on the order with quantity ≤ ordered
   */
  async requestReturn(userId: string, id: string, dto: CreateReturnDto) {
    const order = await this.findOne(userId, id);
    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        'Only delivered orders can be returned',
      );
    }
    const existing = order.returnRequest;
    if (
      existing &&
      (existing.status === ReturnStatus.REQUESTED ||
        existing.status === ReturnStatus.APPROVED ||
        existing.status === ReturnStatus.REFUNDED)
    ) {
      throw new BadRequestException('A return is already in progress');
    }
    const windowDays = 7;
    const delivered =
      order.deliveredAt ??
      (order as unknown as { updatedAt?: Date }).updatedAt;
    if (delivered) {
      const ageMs = Date.now() - delivered.getTime();
      if (ageMs > windowDays * 24 * 60 * 60 * 1000) {
        throw new BadRequestException(
          `Return window of ${windowDays} days has passed`,
        );
      }
    }

    // Validate every requested line against what was actually ordered.
    const orderItemKey = (productId: string, color?: string, size?: string) =>
      `${productId}::${color ?? ''}::${size ?? ''}`;
    const orderQty = new Map<string, number>();
    order.items.forEach((it) =>
      orderQty.set(
        orderItemKey(it.productId.toString(), it.color, it.size),
        it.quantity,
      ),
    );

    const items = dto.items.map((it) => {
      const key = orderItemKey(it.productId, it.color, it.size);
      const max = orderQty.get(key);
      if (!max) {
        throw new BadRequestException(
          `Item ${it.productId} is not on this order`,
        );
      }
      if (it.quantity > max) {
        throw new BadRequestException(
          `Cannot return more of ${it.productId} than was ordered`,
        );
      }
      return {
        productId: new Types.ObjectId(it.productId),
        quantity: it.quantity,
        color: it.color,
        size: it.size,
      };
    });

    order.returnRequest = {
      status: ReturnStatus.REQUESTED,
      reason: dto.reason,
      note: dto.note,
      items,
      refundAmount: 0,
      requestedAt: new Date(),
    } as OrderDocument['returnRequest'];
    this.recordEvent(
      order,
      order.status,
      'customer',
      `Return requested · ${dto.reason}`,
    );
    await order.save();
    await this.notifier.notifyStatusChange(order);
    return order;
  }

  /**
   * Admin approves or rejects an open return request. On approval the
   * order flips to RETURNED and we refund the proportional amount —
   * if the order used the wallet that's credited back; otherwise the
   * money goes to wallet (so we always have a refund destination).
   */
  async decideReturn(orderId: string, dto: DecideReturnDto, adminId: string) {
    const order = await this.requireOrder(orderId);
    const r = order.returnRequest;
    if (!r || r.status !== ReturnStatus.REQUESTED) {
      throw new BadRequestException('No open return request on this order');
    }

    r.decidedAt = new Date();
    r.decidedBy = adminId;
    r.decisionNote = dto.note;

    if (dto.action === 'reject') {
      r.status = ReturnStatus.REJECTED;
      this.recordEvent(
        order,
        order.status,
        adminId,
        `Return rejected${dto.note ? ` · ${dto.note}` : ''}`,
      );
      await order.save();
      await this.notifier.notifyStatusChange(order);
      return order;
    }

    // Approve → compute refund amount.
    const refundAmount = this.computeReturnRefund(order);
    r.refundAmount = refundAmount;
    r.status = ReturnStatus.APPROVED;

    // Try to push the credit through to the customer immediately. We
    // currently route every refund to the wallet — keeps the flow
    // identical for COD, UPI, and card customers without needing a
    // per-gateway refund integration in this iteration.
    if (refundAmount > 0) {
      await this.wallet.credit({
        userId: order.userId.toString(),
        amount: refundAmount,
        reason: WalletEntryReason.ORDER_REFUND,
        orderId: order._id.toString(),
        note: `Refund for return on order ${order.orderNumber}`,
      });
      r.status = ReturnStatus.REFUNDED;
      r.refundDestination = 'wallet';
    }

    // Flip the order itself to RETURNED.
    if (ORDER_STATUS_FLOW[order.status].includes(OrderStatus.RETURNED)) {
      order.status = OrderStatus.RETURNED;
    }
    this.recordEvent(
      order,
      OrderStatus.RETURNED,
      adminId,
      `Return approved · ₹${refundAmount.toFixed(2)} refunded to wallet`,
    );
    await order.save();
    await this.notifier.notifyStatusChange(order);
    return order;
  }

  private computeReturnRefund(order: OrderDocument): number {
    const r = order.returnRequest;
    if (!r) return 0;
    // Proportional refund: returned subtotal / order subtotal × order
    // total (so coupons/shipping/tax/COD-fee scale down proportionally
    // with the returned items).
    const returnedSubtotal = r.items.reduce((sum, ri) => {
      const orderLine = order.items.find(
        (oi) =>
          oi.productId.toString() === ri.productId.toString() &&
          (oi.color ?? '') === (ri.color ?? '') &&
          (oi.size ?? '') === (ri.size ?? ''),
      );
      if (!orderLine) return sum;
      return sum + orderLine.price * ri.quantity;
    }, 0);

    if (returnedSubtotal === 0 || order.subtotal === 0) return 0;
    const ratio = returnedSubtotal / order.subtotal;
    // `total` already nets the wallet portion out, so refunding `total`
    // gives the customer what they actually paid (wallet was already
    // returned at cancellation time; here we mirror the same logic).
    return Math.round(order.total * ratio * 100) / 100;
  }

  private recordEvent(
    order: OrderDocument,
    status: OrderStatus,
    actor: string,
    note?: string,
  ) {
    if (!order.events) order.events = [];
    order.events.push({ status, at: new Date(), actor, note });
  }

  /**
   * Returns wallet credit to the customer when an order with a
   * non-zero `walletAmount` is cancelled. Safe to call on orders
   * without a wallet portion — it short-circuits at 0.
   */
  private async refundWalletIfAny(order: OrderDocument) {
    if (!order.walletAmount || order.walletAmount <= 0) return;
    await this.wallet
      .credit({
        userId: order.userId.toString(),
        amount: order.walletAmount,
        reason: WalletEntryReason.ORDER_REFUND,
        orderId: order._id.toString(),
        note: `Refund for order ${order.orderNumber}`,
      })
      .catch((err) =>
        this.logger.error(
          `Wallet refund failed for order ${order._id.toString()}`,
          err as Error,
        ),
      );
  }

  /** Called by PaymentsService after a gateway captures a charge. */
  async markPaid(orderId: string) {
    const order = await this.requireOrder(orderId);
    if (order.status !== OrderStatus.PENDING) return order;
    order.status = OrderStatus.PAID;
    this.recordEvent(order, OrderStatus.PAID, 'system', 'Payment captured');
    await order.save();
    await Promise.all([
      this.notifier.notifyStatusChange(order),
      this.queue.enqueue('invoice.generate', { orderId: order._id.toString() }),
    ]);
    return order;
  }

  /** Called when a gateway rejects payment — stock is released. */
  async markPaymentFailed(orderId: string, reason: string) {
    if (!Types.ObjectId.isValid(orderId)) return;
    const order = await this.orderModel.findById(orderId).exec();
    if (!order || order.status !== OrderStatus.PENDING) return;
    order.status = OrderStatus.CANCELLED;
    order.cancelledAt = new Date();
    this.recordEvent(
      order,
      OrderStatus.CANCELLED,
      'system',
      `Auto-cancelled: ${reason}`,
    );
    await order.save();
    await this.stock.release(this.linesOf(order));
    await this.notifier.notifyStatusChange(order);
    this.logger.warn(`Order ${order.orderNumber} auto-cancelled: ${reason}`);
  }

  // --- helpers -------------------------------------------------------

  private async requireOrder(id: string): Promise<OrderDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const order = await this.orderModel.findById(id).exec();
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  private assertCanTransition(from: OrderStatus, to: OrderStatus) {
    if (!ORDER_STATUS_FLOW[from].includes(to)) {
      throw new BadRequestException(
        `Cannot transition order from "${from}" to "${to}"`,
      );
    }
  }

  private linesOf(order: OrderDocument) {
    return order.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
    }));
  }

  private async loadActiveProducts(dto: CreateOrderDto) {
    const ids = dto.items.map((i) => new Types.ObjectId(i.productId));
    const products = await this.productModel
      .find({ _id: { $in: ids }, active: true })
      .exec();
    if (products.length !== dto.items.length) {
      throw new BadRequestException('One or more items are unavailable');
    }
    return products;
  }
}
