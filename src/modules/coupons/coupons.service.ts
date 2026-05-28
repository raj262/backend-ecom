import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { Coupon, CouponDocument, DiscountType } from './schemas/coupon.schema';

export interface CouponEvaluation {
  code: string;
  discount: number;
  type: DiscountType;
  description?: string;
}

@Injectable()
export class CouponsService {
  constructor(
    @InjectModel(Coupon.name) private readonly couponModel: Model<CouponDocument>,
  ) {}

  list() {
    return this.couponModel.find().sort({ createdAt: -1 }).exec();
  }

  create(dto: CreateCouponDto) {
    return this.couponModel.create({
      ...dto,
      code: dto.code.toUpperCase(),
    });
  }

  async update(id: string, dto: UpdateCouponDto) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const c = await this.couponModel
      .findByIdAndUpdate(
        id,
        { $set: { ...dto, code: dto.code?.toUpperCase() } },
        { new: true },
      )
      .exec();
    if (!c) throw new NotFoundException('Coupon not found');
    return c;
  }

  async remove(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const res = await this.couponModel.deleteOne({ _id: id }).exec();
    if (res.deletedCount === 0) throw new NotFoundException();
    return { ok: true };
  }

  /**
   * Validate a coupon code against a cart subtotal, returning the computed
   * discount in absolute currency units.
   */
  async validate(code: string, subtotal: number): Promise<CouponEvaluation> {
    const coupon = await this.couponModel
      .findOne({ code: code.toUpperCase(), active: true })
      .exec();
    if (!coupon) throw new BadRequestException('Invalid coupon code');

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) {
      throw new BadRequestException('Coupon is not yet active');
    }
    if (coupon.expiresAt && coupon.expiresAt < now) {
      throw new BadRequestException('Coupon has expired');
    }
    if (subtotal < coupon.minSubtotal) {
      throw new BadRequestException(
        `Order must be at least ${coupon.minSubtotal} to use this coupon`,
      );
    }
    if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) {
      throw new BadRequestException('Coupon usage limit reached');
    }

    let discount =
      coupon.type === DiscountType.PERCENT
        ? (subtotal * coupon.value) / 100
        : coupon.value;
    if (coupon.maxDiscount > 0) discount = Math.min(discount, coupon.maxDiscount);
    discount = Math.min(discount, subtotal);
    discount = Math.round(discount * 100) / 100;

    return {
      code: coupon.code,
      discount,
      type: coupon.type,
      description: coupon.description,
    };
  }

  /** Atomically increment usageCount when an order is placed. */
  async markRedeemed(code: string) {
    await this.couponModel
      .updateOne({ code: code.toUpperCase() }, { $inc: { usageCount: 1 } })
      .exec();
  }
}
