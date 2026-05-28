/**
 * Seed the database with a small demo catalog and an admin user.
 *
 *   npm run seed
 *
 * The script reads MONGODB_URI from .env (same file the API uses).
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import * as bcrypt from 'bcryptjs';
import { connect, disconnect, model } from 'mongoose';
import { UserSchema } from '../modules/users/schemas/user.schema';
import { ProductSchema } from '../modules/products/schemas/product.schema';
import { CategorySchema } from '../modules/categories/schemas/category.schema';
import {
  CouponSchema,
  DiscountType,
} from '../modules/coupons/schemas/coupon.schema';
import { ShippingMethodSchema } from '../modules/shipping/schemas/shipping-method.schema';
import { ShippingZoneSchema } from '../modules/shipping/schemas/shipping-zone.schema';
import { UserRole } from '../common/types/user-role.enum';

loadEnv();

const sampleProducts = [
  {
    name: 'Cashmere Drape Coat',
    slug: 'cashmere-drape-coat',
    description: 'A timeless drape coat in soft Italian cashmere.',
    price: 4299,
    oldPrice: 5299,
    images: ['https://picsum.photos/seed/coat/800/1000'],
    category: 'Outerwear',
    brand: 'Lumière Atelier',
    colors: ['Camel', 'Black'],
    sizes: ['XS', 'S', 'M', 'L'],
    rating: 4.8,
    reviewCount: 128,
    stock: 24,
    isFeatured: true,
    isNew: true,
    onSale: true,
  },
  {
    name: 'Silk Slip Dress',
    slug: 'silk-slip-dress',
    description: 'A bias-cut silk slip dress that catches the light.',
    price: 1899,
    images: ['https://picsum.photos/seed/dress/800/1000'],
    category: 'Dresses',
    brand: 'Maison Noir',
    colors: ['Champagne', 'Midnight'],
    sizes: ['XS', 'S', 'M'],
    rating: 4.6,
    reviewCount: 86,
    stock: 40,
    isNew: true,
  },
  {
    name: 'Leather Crossbody',
    slug: 'leather-crossbody',
    description: 'A petite vegetable-tanned leather crossbody.',
    price: 1299,
    oldPrice: 1599,
    images: ['https://picsum.photos/seed/bag/800/1000'],
    category: 'Bags',
    brand: 'Studio Vega',
    colors: ['Tan', 'Black', 'Olive'],
    sizes: [],
    rating: 4.7,
    reviewCount: 212,
    stock: 60,
    isFeatured: true,
    onSale: true,
  },
];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Copy .env.example to .env first.');
    process.exit(1);
  }

  await connect(uri);
  const UserModel = model('User', UserSchema);
  const ProductModel = model('Product', ProductSchema);
  const CategoryModel = model('Category', CategorySchema);
  const CouponModel = model('Coupon', CouponSchema);
  const ShippingMethodModel = model('ShippingMethod', ShippingMethodSchema);
  const ShippingZoneModel = model('ShippingZone', ShippingZoneSchema);

  // --- demo accounts (admin / staff / vendor) -----------------------
  const seedAccounts: Array<{
    name: string;
    email: string;
    password: string;
    role: UserRole;
  }> = [
    { name: 'Lumière Admin', email: 'admin@lumiere.dev', password: 'Admin@12345', role: UserRole.ADMIN },
    { name: 'Lumière Staff', email: 'staff@lumiere.dev', password: 'Staff@12345', role: UserRole.STAFF },
    { name: 'Vendor Studio', email: 'vendor@lumiere.dev', password: 'Vendor@12345', role: UserRole.VENDOR },
    { name: 'Raj Delivery', email: 'courier@lumiere.dev', password: 'Courier@12345', role: UserRole.COURIER },
  ];

  for (const acc of seedAccounts) {
    const existing = await UserModel.findOne({ email: acc.email });
    if (!existing) {
      const passwordHash = await bcrypt.hash(acc.password, 10);
      await UserModel.create({
        name: acc.name,
        email: acc.email,
        passwordHash,
        role: acc.role,
      });
      console.log(`✓ Created ${acc.role}: ${acc.email} / ${acc.password}`);
    } else {
      console.log(`• ${acc.role} exists: ${acc.email}`);
    }
  }

  // --- categories ----------------------------------------------------
  // Cover the breadth of the catalog so the storefront's "browse" rail
  // looks complete out of the box. `image` URLs are Unsplash thumbnails
  // — admins can swap them later via the Categories page.
  const categories = [
    {
      name: 'New In',
      slug: 'new-in',
      description: "This week's drops.",
      image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=600',
      order: 1,
    },
    {
      name: 'Outerwear',
      slug: 'outerwear',
      description: 'Coats, jackets, and tailored layers.',
      image: 'https://images.unsplash.com/photo-1539109136881-3be0616acf4b?w=600',
      order: 2,
    },
    {
      name: 'Dresses',
      slug: 'dresses',
      description: 'Bias cuts, slips, and editorial silhouettes.',
      image: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=600',
      order: 3,
    },
    {
      name: 'Bags',
      slug: 'bags',
      description: 'Totes, crossbodies, clutches.',
      image: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600',
      order: 4,
    },
    {
      name: 'Shoes',
      slug: 'shoes',
      description: 'Heels, loafers, sneakers.',
      image: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=600',
      order: 5,
    },
    {
      name: 'Jewellery',
      slug: 'jewellery',
      description: 'Fine pieces, hand-finished.',
      image: 'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?w=600',
      order: 6,
    },
    {
      name: 'Fragrance',
      slug: 'fragrance',
      description: 'Eau de parfum and home scent.',
      image: 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=600',
      order: 7,
    },
    {
      name: 'Accessories',
      slug: 'accessories',
      description: 'Belts, scarves, sunglasses.',
      image: 'https://images.unsplash.com/photo-1591348278863-a8fb3887e2aa?w=600',
      order: 8,
    },
  ];
  for (const c of categories) {
    const r = await CategoryModel.updateOne(
      { slug: c.slug },
      { $setOnInsert: c },
      { upsert: true },
    );
    console.log(`${r.upsertedCount ? '✓ Inserted' : '•'} category: ${c.name}`);
  }

  // --- products ------------------------------------------------------
  for (const p of sampleProducts) {
    const result = await ProductModel.updateOne(
      { slug: p.slug },
      { $setOnInsert: p },
      { upsert: true },
    );
    if (result.upsertedCount) {
      console.log(`✓ Inserted product: ${p.name}`);
    } else {
      console.log(`• Product exists, skipped: ${p.name}`);
    }
  }

  // --- coupons -------------------------------------------------------
  const coupons = [
    {
      code: 'WELCOME10',
      description: '10% off your first order',
      type: DiscountType.PERCENT,
      value: 10,
      minSubtotal: 0,
      maxDiscount: 500,
      active: true,
    },
    {
      code: 'FLAT500',
      description: '₹500 off orders over ₹2500',
      type: DiscountType.FIXED,
      value: 500,
      minSubtotal: 2500,
      active: true,
    },
  ];
  for (const c of coupons) {
    const r = await CouponModel.updateOne(
      { code: c.code },
      { $setOnInsert: c },
      { upsert: true },
    );
    console.log(`${r.upsertedCount ? '✓ Inserted' : '•'} coupon: ${c.code}`);
  }

  // --- shipping methods ---------------------------------------------
  const methods = [
    {
      code: 'std',
      name: 'Standard',
      description: '3-5 business days',
      price: 99,
      freeAbove: 1500,
      estimatedDays: 4,
      order: 1,
    },
    {
      code: 'exp',
      name: 'Express',
      description: '1-2 business days',
      price: 199,
      freeAbove: null,
      estimatedDays: 2,
      order: 2,
    },
  ];
  for (const m of methods) {
    const r = await ShippingMethodModel.updateOne(
      { code: m.code },
      { $setOnInsert: m },
      { upsert: true },
    );
    console.log(`${r.upsertedCount ? '✓ Inserted' : '•'} shipping method: ${m.code}`);
  }

  // --- shipping zones -----------------------------------------------
  const zones = [
    {
      code: 'IN-METRO',
      name: 'India · Metro Cities',
      countries: ['IN'],
      cities: ['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad'],
      postalPrefixes: ['400', '110', '560', '600', '700', '500'],
      methodCodes: ['std', 'exp'],
    },
    {
      code: 'IN-REST',
      name: 'India · Rest of country',
      countries: ['IN'],
      methodCodes: ['std'],
    },
  ];
  for (const z of zones) {
    const r = await ShippingZoneModel.updateOne(
      { code: z.code },
      { $setOnInsert: z },
      { upsert: true },
    );
    console.log(`${r.upsertedCount ? '✓ Inserted' : '•'} shipping zone: ${z.code}`);
  }

  await disconnect();
  console.log('\nDone.');
}

main().catch(async (err) => {
  console.error(err);
  await disconnect();
  process.exit(1);
});
