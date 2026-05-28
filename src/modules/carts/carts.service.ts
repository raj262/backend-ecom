import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { AddItemDto, UpdateItemDto } from './dto/add-item.dto';
import { Cart, CartDocument } from './schemas/cart.schema';

@Injectable()
export class CartsService {
  constructor(
    @InjectModel(Cart.name) private readonly cartModel: Model<CartDocument>,
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  private userObj(userId: string) {
    return new Types.ObjectId(userId);
  }

  async get(userId: string) {
    const cart = await this.cartModel
      .findOne({ userId: this.userObj(userId) })
      .populate('items.productId')
      .exec();
    if (cart) return cart;
    return this.cartModel.create({ userId: this.userObj(userId), items: [] });
  }

  async addItem(userId: string, dto: AddItemDto) {
    const product = await this.productModel
      .findById(dto.productId)
      .exec();
    if (!product || !product.active) {
      throw new NotFoundException('Product not available');
    }

    const cart =
      (await this.cartModel.findOne({ userId: this.userObj(userId) }).exec()) ??
      (await this.cartModel.create({ userId: this.userObj(userId), items: [] }));

    const existing = cart.items.find(
      (i) =>
        i.productId.toString() === dto.productId &&
        i.color === dto.color &&
        i.size === dto.size,
    );

    if (existing) {
      existing.quantity += dto.quantity;
    } else {
      cart.items.push({
        productId: product._id,
        quantity: dto.quantity,
        color: dto.color,
        size: dto.size,
        priceAtAdd: product.price,
      });
    }
    await cart.save();
    return cart.populate('items.productId');
  }

  async updateItem(userId: string, productId: string, dto: UpdateItemDto) {
    const cart = await this.cartModel
      .findOne({ userId: this.userObj(userId) })
      .exec();
    if (!cart) throw new NotFoundException('Cart not found');
    const item = cart.items.find((i) => i.productId.toString() === productId);
    if (!item) throw new NotFoundException('Item not in cart');
    item.quantity = dto.quantity;
    await cart.save();
    return cart.populate('items.productId');
  }

  async removeItem(userId: string, productId: string) {
    const cart = await this.cartModel
      .findOne({ userId: this.userObj(userId) })
      .exec();
    if (!cart) throw new NotFoundException('Cart not found');
    cart.items = cart.items.filter((i) => i.productId.toString() !== productId);
    await cart.save();
    return cart.populate('items.productId');
  }

  async clear(userId: string) {
    const cart = await this.cartModel
      .findOneAndUpdate(
        { userId: this.userObj(userId) },
        { $set: { items: [], couponCode: undefined } },
        { new: true, upsert: true },
      )
      .exec();
    return cart!;
  }

  async applyCoupon(userId: string, code: string | null) {
    const cart = await this.cartModel
      .findOneAndUpdate(
        { userId: this.userObj(userId) },
        { $set: { couponCode: code ?? undefined } },
        { new: true, upsert: true },
      )
      .populate('items.productId')
      .exec();
    return cart!;
  }

  /**
   * Merge a guest cart (held in localStorage on the storefront) into the
   * authenticated cart on login. Same product+variant lines stack, new
   * lines append. Coupon code from the guest cart wins only if the user
   * cart didn't have one.
   */
  async mergeGuestCart(
    userId: string,
    guest: {
      items: Array<{
        productId: string;
        quantity: number;
        color?: string;
        size?: string;
        priceAtAdd?: number;
      }>;
      couponCode?: string;
    },
  ) {
    if (!guest?.items?.length) return this.get(userId);

    const ids = guest.items
      .map((i) => i.productId)
      .filter((id) => Types.ObjectId.isValid(id));
    const products = await this.productModel
      .find({ _id: { $in: ids }, active: true })
      .exec();
    const byId = new Map(products.map((p) => [p._id.toString(), p]));

    const cart =
      (await this.cartModel.findOne({ userId: this.userObj(userId) }).exec()) ??
      (await this.cartModel.create({ userId: this.userObj(userId), items: [] }));

    for (const incoming of guest.items) {
      const product = byId.get(incoming.productId);
      if (!product) continue;
      const sameLine = cart.items.find(
        (i) =>
          i.productId.toString() === incoming.productId &&
          i.color === incoming.color &&
          i.size === incoming.size,
      );
      if (sameLine) {
        sameLine.quantity += incoming.quantity;
      } else {
        cart.items.push({
          productId: product._id,
          quantity: incoming.quantity,
          color: incoming.color,
          size: incoming.size,
          priceAtAdd: incoming.priceAtAdd ?? product.price,
        });
      }
    }
    if (!cart.couponCode && guest.couponCode) {
      cart.couponCode = guest.couponCode;
    }
    await cart.save();
    return cart.populate('items.productId');
  }
}
