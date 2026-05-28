import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomCode } from '../../utils/ids';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Wishlist, WishlistDocument } from './schemas/wishlist.schema';

@Injectable()
export class WishlistService {
  constructor(
    @InjectModel(Wishlist.name)
    private readonly wishlistModel: Model<WishlistDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  private toObjectId(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid product id');
    }
    return new Types.ObjectId(id);
  }

  async get(userId: string) {
    const list = await this.wishlistModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .populate({
        path: 'productIds',
        match: { active: { $ne: false } },
      })
      .exec();
    if (list) return list;
    return this.wishlistModel.create({
      userId: new Types.ObjectId(userId),
      productIds: [],
    });
  }

  async add(userId: string, productId: string) {
    const pid = this.toObjectId(productId);
    // Snapshot the current price so the scanner has a baseline to
    // compare against later. We do this here (rather than in the
    // scanner's first pass) so even a same-second visit captures the
    // price the user actually saw at add time.
    const product = await this.productModel
      .findById(pid)
      .select('price active')
      .exec();
    const snapshotPrice = product?.price ?? 0;

    await this.wishlistModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        { $addToSet: { productIds: pid } },
        { upsert: true },
      )
      .exec();

    const hasEntry = await this.wishlistModel.exists({
      userId: new Types.ObjectId(userId),
      'entries.productId': pid,
    });
    if (!hasEntry) {
      await this.wishlistModel.updateOne(
        { userId: new Types.ObjectId(userId) },
        {
          $push: {
            entries: {
              productId: pid,
              addedAt: new Date(),
              priceAtAdd: snapshotPrice,
              lowestPriceSeen: snapshotPrice,
              lastAlertPrice: null,
              lastAlertAt: null,
            },
          },
        },
      );
    }

    return this.wishlistModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .populate({
        path: 'productIds',
        match: { active: { $ne: false } },
      })
      .exec();
  }

  async remove(userId: string, productId: string) {
    const pid = this.toObjectId(productId);
    return this.wishlistModel
      .findOneAndUpdate(
        { userId: new Types.ObjectId(userId) },
        {
          $pull: {
            productIds: pid,
            entries: { productId: pid },
          },
        },
        { new: true, upsert: true },
      )
      .populate({
        path: 'productIds',
        match: { active: { $ne: false } },
      })
      .exec();
  }

  /**
   * Returns the wishlist plus per-product price-drop signals. The
   * shape merges the populated product with the snapshot bookkeeping
   * so the mobile client doesn't need to JOIN locally.
   */
  async getWithSignals(userId: string) {
    const wishlist = await this.get(userId);
    const entries = wishlist.entries ?? [];
    const map = new Map(entries.map((e) => [e.productId.toString(), e]));
    const products = (
      wishlist.productIds as unknown as Array<{
        _id: Types.ObjectId;
        price?: number;
      } | null>
    ).filter((p): p is { _id: Types.ObjectId; price?: number } => !!p && !!p._id);

    return {
      items: products.map((p) => {
        const e = map.get(p._id.toString());
        const currentPrice = p.price ?? 0;
        const baseline = e?.priceAtAdd ?? currentPrice;
        const lowest = Math.min(e?.lowestPriceSeen ?? baseline, currentPrice);
        const dropped = currentPrice < baseline;
        const pct = baseline > 0 ? Math.round(((baseline - currentPrice) / baseline) * 100) : 0;
        return {
          product: p,
          priceAtAdd: baseline,
          lowestPriceSeen: lowest,
          currentPrice,
          dropPct: dropped ? pct : 0,
          dropped,
          lastAlertAt: e?.lastAlertAt ?? null,
        };
      }),
      shareSlug: wishlist.shareSlug ?? null,
      sharePublic: wishlist.sharePublic ?? false,
    };
  }

  /**
   * Lazily mints a `shareSlug` on first use, then toggles `sharePublic`.
   * Returning the slug+state lets the storefront render a copyable URL like
   * `/wishlist/share/<slug>` without exposing the userId.
   */
  async setSharing(userId: string, sharePublic: boolean) {
    let wishlist = await this.wishlistModel
      .findOne({ userId: new Types.ObjectId(userId) })
      .exec();
    if (!wishlist) {
      wishlist = await this.wishlistModel.create({
        userId: new Types.ObjectId(userId),
        productIds: [],
      });
    }
    if (sharePublic && !wishlist.shareSlug) {
      wishlist.shareSlug = `${randomCode(4)}-${randomCode(6)}`.toLowerCase();
    }
    wishlist.sharePublic = sharePublic;
    await wishlist.save();
    return { shareSlug: wishlist.shareSlug, sharePublic: wishlist.sharePublic };
  }

  /** Public read-only view of someone else's wishlist by share slug. */
  async getBySlug(slug: string) {
    const wishlist = await this.wishlistModel
      .findOne({ shareSlug: slug, sharePublic: true })
      .populate('productIds')
      .exec();
    if (!wishlist) {
      throw new NotFoundException('This wishlist is private or does not exist');
    }
    return {
      products: wishlist.productIds,
      shareSlug: wishlist.shareSlug,
      updatedAt: wishlist.get('updatedAt') as Date,
    };
  }
}
