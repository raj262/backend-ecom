import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, SortOrder, Types } from 'mongoose';
import { UserRole } from '../../common/types/user-role.enum';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product, ProductDocument } from './schemas/product.schema';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name)
    private readonly productModel: Model<ProductDocument>,
  ) {}

  async paginate(query: QueryProductsDto, opts: { vendorId?: string } = {}) {
    const {
      page = 1,
      limit = 20,
      q,
      category,
      brand,
      color,
      size,
      minPrice,
      maxPrice,
      minRating,
      onSale,
      isNew,
      isFeatured,
      sort = 'latest',
    } = query;

    const filter: FilterQuery<ProductDocument> = { active: true };
    if (opts.vendorId) filter.vendorId = new Types.ObjectId(opts.vendorId);
    if (q) filter.$text = { $search: q };
    if (category) filter.category = category;
    if (brand) filter.brand = brand;
    if (color) filter.colors = color;
    if (size) filter.sizes = size;
    if (typeof onSale === 'boolean') filter.onSale = onSale;
    if (typeof isNew === 'boolean') filter.isNew = isNew;
    if (typeof isFeatured === 'boolean') filter.isFeatured = isFeatured;
    if (typeof minRating === 'number') filter.rating = { $gte: minRating };
    if (typeof minPrice === 'number' || typeof maxPrice === 'number') {
      filter.price = {};
      if (typeof minPrice === 'number') filter.price.$gte = minPrice;
      if (typeof maxPrice === 'number') filter.price.$lte = maxPrice;
    }

    const sortMap: Record<string, Record<string, SortOrder>> = {
      latest: { createdAt: -1 },
      popular: { reviewCount: -1, rating: -1 },
      'price-asc': { price: 1 },
      'price-desc': { price: -1 },
      rating: { rating: -1, reviewCount: -1 },
    };

    const [items, total] = await Promise.all([
      this.productModel
        .find(filter)
        .sort(sortMap[sort])
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.productModel.countDocuments(filter).exec(),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async findBySlug(slug: string) {
    const product = await this.productModel.findOne({ slug, active: true }).exec();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async findById(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException();
    const product = await this.productModel.findById(id).exec();
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  create(dto: CreateProductDto, owner: { sub: string; role: UserRole }) {
    // Vendors always own what they create. Admins may create platform-owned
    // products (vendorId = null) unless they choose to assign one later.
    const vendorId =
      owner.role === UserRole.VENDOR ? new Types.ObjectId(owner.sub) : null;
    return this.productModel.create({ ...dto, vendorId });
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    actor: { sub: string; role: UserRole },
  ) {
    const product = await this.findById(id);
    this.assertCanMutate(product, actor);
    Object.assign(product, dto);
    return product.save();
  }

  async softDelete(id: string, actor: { sub: string; role: UserRole }) {
    const product = await this.findById(id);
    this.assertCanMutate(product, actor);
    product.active = false;
    await product.save();
    return { ok: true };
  }

  /** Throws unless actor is admin OR is the owning vendor. */
  private assertCanMutate(
    product: ProductDocument,
    actor: { sub: string; role: UserRole },
  ) {
    if (actor.role === UserRole.ADMIN) return;
    if (
      actor.role === UserRole.VENDOR &&
      product.vendorId?.toString() === actor.sub
    ) {
      return;
    }
    throw new ForbiddenException('You do not own this product');
  }
}
