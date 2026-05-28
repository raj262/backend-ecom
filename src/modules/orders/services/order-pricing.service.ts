import { BadRequestException, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { round2 } from '../../../utils/money';
import { CouponsService } from '../../coupons/coupons.service';
import { ProductDocument } from '../../products/schemas/product.schema';
import { CreateOrderDto, OrderItemInput } from '../dto/create-order.dto';
import { PaymentMethod } from '../schemas/order.schema';

const COD_FEE = 49;
const FREE_SHIPPING_THRESHOLD = 1500;
const SHIPPING_FEE = 99;
const TAX_RATE = 0.08;

export interface OrderPricing {
  items: Array<{
    productId: Types.ObjectId;
    name: string;
    image: string;
    quantity: number;
    price: number;
    color?: string;
    size?: string;
  }>;
  subtotal: number;
  discount: number;
  shippingFee: number;
  codFee: number;
  tax: number;
  /** Gross total before wallet credit is applied. */
  total: number;
  /** Wallet credit actually applied (≤ requested, ≤ user balance, ≤ total). */
  walletAmount: number;
  /** Net amount the customer still pays through card/UPI/COD. */
  payable: number;
}

/**
 * Pure pricing arithmetic. No DB writes, no notifications, no stock.
 * Splitting this out keeps `OrdersService` focused on orchestration and
 * makes the math unit-testable in isolation.
 */
@Injectable()
export class OrderPricingService {
  constructor(private readonly coupons: CouponsService) {}

  async build(
    dto: CreateOrderDto,
    products: ProductDocument[],
    /** Current wallet balance — used to clamp `dto.walletAmount`. */
    walletBalance = 0,
  ): Promise<OrderPricing> {
    const productById = new Map(products.map((p) => [p._id.toString(), p]));

    let subtotal = 0;
    const items = dto.items.map((line: OrderItemInput) => {
      const product = productById.get(line.productId);
      if (!product) {
        // Caller already validated existence — defensive guard.
        throw new BadRequestException('One or more items are unavailable');
      }
      const lineTotal = product.price * line.quantity;
      subtotal += lineTotal;
      return {
        productId: product._id,
        name: product.name,
        image: product.images[0] ?? '',
        quantity: line.quantity,
        price: product.price,
        color: line.color,
        size: line.size,
      };
    });

    // Discount is server-derived; never trust the client.
    const discount = dto.couponCode
      ? (await this.coupons.validate(dto.couponCode, subtotal)).discount
      : 0;

    const shippingFee = subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
    const codFee = dto.paymentMethod === PaymentMethod.COD ? COD_FEE : 0;
    const tax = round2((subtotal - discount) * TAX_RATE);
    const total = Math.max(0, subtotal - discount) + shippingFee + codFee + tax;

    // Wallet is applied last (after tax + shipping + cod) and clamped
    // to whichever is smallest: requested / balance / current total.
    const requestedWallet = Math.max(0, dto.walletAmount ?? 0);
    const walletAmount = round2(
      Math.min(requestedWallet, walletBalance, total),
    );
    const payable = round2(total - walletAmount);

    return {
      items,
      subtotal,
      discount,
      shippingFee,
      codFee,
      tax,
      total,
      walletAmount,
      payable,
    };
  }
}
