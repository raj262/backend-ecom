import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UserRole } from '../../common/types/user-role.enum';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { CreateReviewDto } from './dto/create-review.dto';
import { Review, ReviewDocument } from './schemas/review.schema';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name) private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
  ) {}

  async listForProduct(productId: string) {
    if (!Types.ObjectId.isValid(productId)) throw new NotFoundException();
    return this.reviewModel
      .find({ productId: new Types.ObjectId(productId) })
      .sort({ helpful: -1, createdAt: -1 })
      .exec();
  }

  /**
   * Aggregated stats for the product detail page: total count, average
   * rating, and a 5→1 star distribution. Computed in a single pipeline
   * so the histogram + headline numbers stay consistent.
   */
  async summaryForProduct(productId: string): Promise<{
    productId: string;
    total: number;
    average: number;
    /** Counts indexed 5,4,3,2,1. */
    distribution: Record<1 | 2 | 3 | 4 | 5, number>;
    verifiedCount: number;
  }> {
    if (!Types.ObjectId.isValid(productId)) throw new NotFoundException();
    const oid = new Types.ObjectId(productId);

    const [agg] = await this.reviewModel.aggregate<{
      total: number;
      average: number;
      buckets: { rating: number; count: number }[];
      verifiedCount: number;
    }>([
      { $match: { productId: oid } },
      {
        $group: {
          _id: '$rating',
          count: { $sum: 1 },
          verified: { $sum: { $cond: ['$verifiedPurchase', 1, 0] } },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$count' },
          weighted: { $sum: { $multiply: ['$_id', '$count'] } },
          buckets: { $push: { rating: '$_id', count: '$count' } },
          verifiedCount: { $sum: '$verified' },
        },
      },
      {
        $project: {
          _id: 0,
          total: 1,
          average: {
            $cond: [
              { $gt: ['$total', 0] },
              { $divide: ['$weighted', '$total'] },
              0,
            ],
          },
          buckets: 1,
          verifiedCount: 1,
        },
      },
    ]);

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    if (agg?.buckets) {
      for (const b of agg.buckets) {
        const r = Math.max(1, Math.min(5, Math.round(b.rating))) as
          | 1
          | 2
          | 3
          | 4
          | 5;
        distribution[r] = (distribution[r] ?? 0) + b.count;
      }
    }

    return {
      productId,
      total: agg?.total ?? 0,
      average: agg ? Math.round(agg.average * 10) / 10 : 0,
      distribution,
      verifiedCount: agg?.verifiedCount ?? 0,
    };
  }

  /** Admin-only paginated feed of every review on the platform. */
  async listAll(opts: {
    page: number;
    limit: number;
    productId?: string;
    minRating?: number;
  }) {
    const { page, limit, productId, minRating } = opts;
    const filter: Record<string, unknown> = {};
    if (productId && Types.ObjectId.isValid(productId)) {
      filter.productId = new Types.ObjectId(productId);
    }
    if (typeof minRating === 'number') filter.rating = { $gte: minRating };

    const [items, total] = await Promise.all([
      this.reviewModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('productId', 'name slug images')
        .exec(),
      this.reviewModel.countDocuments(filter).exec(),
    ]);
    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async create(userId: string, dto: CreateReviewDto) {
    if (!Types.ObjectId.isValid(dto.productId)) {
      throw new NotFoundException('Product not found');
    }

    const [product, user] = await Promise.all([
      this.productModel.findById(dto.productId).exec(),
      this.userModel.findById(userId).exec(),
    ]);
    if (!product) throw new NotFoundException('Product not found');
    if (!user) throw new NotFoundException('User not found');

    const verifiedPurchase = await this.hasOrderedProduct(userId, dto.productId);

    try {
      const review = await this.reviewModel.create({
        productId: product._id,
        userId: user._id,
        userName: user.name,
        userAvatarUrl: user.avatarUrl,
        rating: dto.rating,
        title: dto.title,
        body: dto.body,
        media: (dto.media ?? []).slice(0, 6),
        verifiedPurchase,
      });
      await this.recomputeProductRating(product._id.toString());
      return review;
    } catch (err: unknown) {
      // duplicate key (one review per user per product)
      if ((err as { code?: number }).code === 11000) {
        throw new ConflictException('You have already reviewed this product');
      }
      throw err;
    }
  }

  /**
   * Toggles a "helpful" vote. Maintains both the counter and the voters set
   * atomically so a refresh-spam can't double-count.
   */
  async voteHelpful(reviewId: string, userId: string) {
    if (!Types.ObjectId.isValid(reviewId)) throw new NotFoundException();
    const uid = new Types.ObjectId(userId);
    const review = await this.reviewModel.findById(reviewId).exec();
    if (!review) throw new NotFoundException('Review not found');

    const alreadyVoted = review.voters.some((v) => v.equals(uid));
    const update = alreadyVoted
      ? { $pull: { voters: uid }, $inc: { helpful: -1 } }
      : { $addToSet: { voters: uid }, $inc: { helpful: 1 } };

    return this.reviewModel
      .findByIdAndUpdate(reviewId, update, { new: true })
      .exec();
  }

  async remove(reviewId: string, actor: { sub: string; role: UserRole }) {
    if (!Types.ObjectId.isValid(reviewId)) throw new NotFoundException();
    const review = await this.reviewModel.findById(reviewId).exec();
    if (!review) throw new NotFoundException('Review not found');

    if (actor.role !== UserRole.ADMIN && review.userId.toString() !== actor.sub) {
      throw new ForbiddenException('You can only delete your own reviews');
    }

    const productId = review.productId.toString();
    await review.deleteOne();
    await this.recomputeProductRating(productId);
    return { ok: true };
  }

  // ------------------------------------------------------------------
  // helpers
  // ------------------------------------------------------------------

  private async hasOrderedProduct(userId: string, productId: string) {
    const exists = await this.orderModel.exists({
      userId: new Types.ObjectId(userId),
      'items.productId': new Types.ObjectId(productId),
      status: { $in: ['delivered', 'shipped'] },
    });
    return Boolean(exists);
  }

  /** Re-aggregates rating + reviewCount on the parent product. */
  private async recomputeProductRating(productId: string) {
    const [agg] = await this.reviewModel.aggregate<{
      avg: number;
      count: number;
    }>([
      { $match: { productId: new Types.ObjectId(productId) } },
      {
        $group: {
          _id: '$productId',
          avg: { $avg: '$rating' },
          count: { $sum: 1 },
        },
      },
    ]);
    await this.productModel.updateOne(
      { _id: new Types.ObjectId(productId) },
      {
        $set: {
          rating: agg ? Math.round(agg.avg * 10) / 10 : 0,
          reviewCount: agg ? agg.count : 0,
        },
      },
    );
  }
}
