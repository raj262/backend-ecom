import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserRole } from '../../common/types/user-role.enum';
import { OrdersService } from '../orders/orders.service';
import { EasebuzzProvider } from './providers/easebuzz.provider';
import { PaymentProviderAdapter } from './providers/payment-provider.interface';
import { RazorpayProvider } from './providers/razorpay.provider';
import {
  Payment,
  PaymentDocument,
  PaymentProvider,
  PaymentStatus,
} from './schemas/payment.schema';

@Injectable()
export class PaymentsService {
  private readonly adapters: Record<string, PaymentProviderAdapter>;

  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel: Model<PaymentDocument>,
    razorpay: RazorpayProvider,
    easebuzz: EasebuzzProvider,
    @Inject(forwardRef(() => OrdersService))
    private readonly orders: OrdersService,
  ) {
    this.adapters = {
      [PaymentProvider.RAZORPAY]: razorpay,
      [PaymentProvider.EASEBUZZ]: easebuzz,
    };
  }

  /** Called by OrdersService at order creation time. */
  createForOrder(input: {
    orderId: string;
    userId: string;
    amount: number;
    provider: PaymentProvider;
    currency?: string;
  }) {
    return this.paymentModel.create({
      orderId: new Types.ObjectId(input.orderId),
      userId: new Types.ObjectId(input.userId),
      amount: input.amount,
      currency: input.currency ?? 'INR',
      provider: input.provider,
      status: PaymentStatus.PENDING,
    });
  }

  listForUser(userId: string) {
    return this.paymentModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .exec();
  }

  async findOne(actor: { sub: string; role: UserRole }, id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const payment = await this.paymentModel.findById(id).exec();
    if (!payment) throw new NotFoundException('Payment not found');
    if (
      actor.role !== UserRole.ADMIN &&
      payment.userId.toString() !== actor.sub
    ) {
      throw new ForbiddenException('Not your payment');
    }
    return payment;
  }

  // --- Gateway flow -------------------------------------------------

  /**
   * Step 2 of the payment flow: create a gateway-side order/intent and
   * return the blob the client SDK opens. Existing local Payment row is
   * mutated with `providerRef` so we can look it up at verify time.
   */
  async initCheckout(input: {
    paymentId: string;
    userId: string;
    customer: { email?: string; phone?: string; name?: string };
  }) {
    const payment = await this.paymentModel.findById(input.paymentId).exec();
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.userId.toString() !== input.userId) {
      throw new ForbiddenException('Not your payment');
    }
    const adapter = this.adapters[payment.provider];
    if (!adapter) {
      throw new BadRequestException(
        `Provider ${payment.provider} does not support hosted checkout`,
      );
    }
    const out = await adapter.init({
      amount: payment.amount,
      currency: payment.currency,
      orderId: payment.orderId.toString(),
      customer: input.customer,
    });
    payment.providerRef = out.providerRef;
    payment.status = PaymentStatus.AUTHORIZED;
    await payment.save();
    return out;
  }

  /**
   * Step 3 of the payment flow: gateway → us → verify HMAC → flip Payment
   * and Order to PAID. If the signature is bad we mark the payment failed
   * and let OrdersService cancel + release stock.
   */
  async verifyAndCapture(input: {
    paymentId: string;
    userId: string;
    signature: string;
    fields: Record<string, string>;
  }) {
    const payment = await this.paymentModel.findById(input.paymentId).exec();
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.userId.toString() !== input.userId) {
      throw new ForbiddenException('Not your payment');
    }
    const adapter = this.adapters[payment.provider];
    if (!adapter) throw new BadRequestException('Cannot verify this provider');

    const ok = await adapter.verify({
      orderId: payment.orderId.toString(),
      providerRef: payment.providerRef ?? '',
      signature: input.signature,
      fields: input.fields,
    });

    if (!ok) {
      payment.status = PaymentStatus.FAILED;
      payment.failureReason = 'Signature mismatch';
      payment.meta = { fields: input.fields };
      await payment.save();
      await this.orders.markPaymentFailed(
        payment.orderId.toString(),
        'Signature mismatch',
      );
      throw new BadRequestException('Payment verification failed');
    }

    payment.status = PaymentStatus.CAPTURED;
    payment.capturedAt = new Date();
    payment.meta = { fields: input.fields };
    await payment.save();
    await this.orders.markPaid(payment.orderId.toString());
    return payment;
  }

  // --- Admin --------------------------------------------------------

  async listAll(opts: { page: number; limit: number; status?: PaymentStatus }) {
    const { page, limit, status } = opts;
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    const [items, total] = await Promise.all([
      this.paymentModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.paymentModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async markCaptured(id: string, providerRef?: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const p = await this.paymentModel
      .findByIdAndUpdate(
        id,
        {
          $set: {
            status: PaymentStatus.CAPTURED,
            capturedAt: new Date(),
            providerRef,
          },
        },
        { new: true },
      )
      .exec();
    if (!p) throw new NotFoundException();
    return p;
  }

  async markRefunded(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const p = await this.paymentModel
      .findByIdAndUpdate(
        id,
        { $set: { status: PaymentStatus.REFUNDED, refundedAt: new Date() } },
        { new: true },
      )
      .exec();
    if (!p) throw new NotFoundException();
    return p;
  }
}
