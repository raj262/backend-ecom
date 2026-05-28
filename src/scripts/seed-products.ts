/**
 * Bulk-seed dummy products for development & demos.
 *
 *   npm run seed:products            # default: 100 products
 *   npm run seed:products -- 250     # custom count
 *   npm run seed:products -- 100 --wipe   # wipe dummy rows first
 *
 * Dummy rows are tagged with `aiTags: ['seed:dummy']` so `--wipe` only
 * deletes seeded data and never touches real products.
 *
 * Safe to re-run — each product is upserted by slug.
 */
import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { connect, disconnect, model } from 'mongoose';
import { CategorySchema } from '../modules/categories/schemas/category.schema';
import { ProductSchema } from '../modules/products/schemas/product.schema';

loadEnv();

const SEED_TAG = 'seed:dummy';

interface CatalogPool {
  category: { slug: string; name: string };
  brands: string[];
  adjectives: string[];
  nouns: string[];
  colors: string[];
  sizes: string[];
  priceRange: [number, number];
  aiTags: string[];
}

/**
 * Hand-tuned pools per category so generated names actually sound like
 * the category (no "Silk Slip Crossbody"). Each pool also carries its
 * own price range, color/size palette, and AI tags.
 */
const POOLS: CatalogPool[] = [
  {
    category: { slug: 'outerwear', name: 'Outerwear' },
    brands: ['Lumière Atelier', 'Maison Noir', 'Studio Vega', 'North & Co.'],
    adjectives: ['Cashmere', 'Wool', 'Quilted', 'Belted', 'Cropped', 'Oversized', 'Trench'],
    nouns: ['Coat', 'Jacket', 'Blazer', 'Parka', 'Overcoat', 'Cape'],
    colors: ['Camel', 'Black', 'Charcoal', 'Ivory', 'Olive', 'Navy'],
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    priceRange: [1899, 6499],
    aiTags: ['winter', 'layering', 'formal'],
  },
  {
    category: { slug: 'dresses', name: 'Dresses' },
    brands: ['Maison Noir', 'Atelier Bloom', 'Lumière Studio', 'Velour'],
    adjectives: ['Silk', 'Linen', 'Pleated', 'Bias-Cut', 'Ruched', 'Tiered', 'Wrap'],
    nouns: ['Slip Dress', 'Midi Dress', 'Maxi Dress', 'Shirt Dress', 'Wrap Dress', 'Gown'],
    colors: ['Champagne', 'Midnight', 'Blush', 'Sage', 'Crimson', 'Ivory'],
    sizes: ['XS', 'S', 'M', 'L'],
    priceRange: [999, 3899],
    aiTags: ['eveningwear', 'occasion', 'feminine'],
  },
  {
    category: { slug: 'bags', name: 'Bags' },
    brands: ['Studio Vega', 'Maison Noir', 'Atelier Marais', 'Côte & Co.'],
    adjectives: ['Leather', 'Vegetable-Tanned', 'Pebbled', 'Embossed', 'Quilted', 'Mini', 'Structured'],
    nouns: ['Crossbody', 'Tote', 'Shoulder Bag', 'Bucket Bag', 'Backpack', 'Clutch'],
    colors: ['Tan', 'Black', 'Cognac', 'Olive', 'Ivory', 'Burgundy'],
    sizes: [],
    priceRange: [799, 4299],
    aiTags: ['everyday', 'accessory', 'leather'],
  },
  {
    category: { slug: 'shoes', name: 'Shoes' },
    brands: ['Atelier Marais', 'Studio Vega', 'Lumière', 'Côte Walk'],
    adjectives: ['Suede', 'Patent', 'Almond-Toe', 'Sculpted', 'Block-Heel', 'Slingback', 'Mary Jane'],
    nouns: ['Pumps', 'Loafers', 'Ankle Boots', 'Mules', 'Sandals', 'Ballet Flats'],
    colors: ['Black', 'Beige', 'Wine', 'Tan', 'Silver', 'Olive'],
    sizes: ['36', '37', '38', '39', '40', '41'],
    priceRange: [1299, 4999],
    aiTags: ['footwear', 'staple'],
  },
  {
    category: { slug: 'accessories', name: 'Accessories' },
    brands: ['Lumière', 'Maison Noir', 'Studio Vega', 'Atelier Bloom'],
    adjectives: ['Cashmere', 'Silk', 'Wool', 'Knit', 'Pleated', 'Embroidered'],
    nouns: ['Scarf', 'Belt', 'Hat', 'Sunglasses', 'Hair Clip', 'Gloves'],
    colors: ['Ivory', 'Camel', 'Black', 'Burgundy', 'Forest', 'Slate'],
    sizes: [],
    priceRange: [299, 1899],
    aiTags: ['accessory', 'gift'],
  },
  {
    category: { slug: 'jewelry', name: 'Jewelry' },
    brands: ['Aurelia', 'Maison Noir', 'Studio Vega'],
    adjectives: ['18k Gold', 'Sterling', 'Pearl', 'Twisted', 'Pavé', 'Hammered', 'Solitaire'],
    nouns: ['Hoops', 'Pendant', 'Stack Ring', 'Chain Necklace', 'Cuff', 'Tennis Bracelet'],
    colors: ['Gold', 'Silver', 'Rose Gold'],
    sizes: [],
    priceRange: [799, 5999],
    aiTags: ['fine-jewelry', 'gift', 'minimal'],
  },
];

interface CliArgs {
  count: number;
  wipe: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  let count = 100;
  let wipe = false;
  for (const a of args) {
    if (a === '--wipe') wipe = true;
    else if (/^\d+$/.test(a)) count = Number(a);
  }
  return { count, wipe };
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], min: number, max: number): T[] {
  if (arr.length === 0) return [];
  const n = Math.min(arr.length, min + Math.floor(Math.random() * (max - min + 1)));
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function priceIn([lo, hi]: [number, number]): number {
  // Snap to a "retail-looking" number: ends in 9, 99, or 49.
  const raw = lo + Math.floor(Math.random() * (hi - lo));
  const tail = pick([9, 49, 99]);
  return Math.floor(raw / 100) * 100 + tail;
}

interface GeneratedProduct {
  name: string;
  slug: string;
  description: string;
  price: number;
  oldPrice?: number;
  images: string[];
  category: string;
  brand: string;
  colors: string[];
  sizes: string[];
  rating: number;
  reviewCount: number;
  stock: number;
  isFeatured: boolean;
  isNew: boolean;
  onSale: boolean;
  aiTags: string[];
  popularity: number;
  active: boolean;
}

function generate(index: number, pool: CatalogPool): GeneratedProduct {
  const adjective = pick(pool.adjectives);
  const noun = pick(pool.nouns);
  const brand = pick(pool.brands);
  const name = `${adjective} ${noun}`;
  // Slug must be unique across re-runs → include index + brand initials.
  const brandSlug = brand
    .toLowerCase()
    .replace(/[^a-z]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const slug = `${adjective}-${noun}-${brandSlug}-${index}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  const price = priceIn(pool.priceRange);
  const onSale = Math.random() < 0.35;
  const oldPrice = onSale
    ? price + Math.floor(price * (0.15 + Math.random() * 0.3))
    : undefined;

  const isNew = Math.random() < 0.4;
  const isFeatured = Math.random() < 0.2;
  const stock = Math.floor(Math.random() * 60) + 5;
  const rating = Number((3.8 + Math.random() * 1.2).toFixed(1));
  const reviewCount = Math.floor(Math.random() * 350);

  // Pull 2-3 deterministic-ish Picsum images so they vary but stay stable.
  const imageSeeds = [slug, `${slug}-2`, `${slug}-3`];
  const images = imageSeeds.map(
    (s) => `https://picsum.photos/seed/${encodeURIComponent(s)}/800/1000`,
  );

  return {
    name,
    slug,
    description: `${name} from ${brand}. Crafted from premium materials with a considered silhouette.`,
    price,
    oldPrice,
    images,
    category: pool.category.slug,
    brand,
    colors: pickN(pool.colors, 1, Math.min(3, pool.colors.length)),
    sizes: pool.sizes,
    rating,
    reviewCount,
    stock,
    isFeatured,
    isNew,
    onSale,
    aiTags: [SEED_TAG, ...pool.aiTags],
    popularity: reviewCount + Math.floor(rating * 50),
    active: true,
  };
}

async function main() {
  const { count, wipe } = parseArgs();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set. Copy .env.example to .env first.');
    process.exit(1);
  }

  await connect(uri);
  const ProductModel = model('Product', ProductSchema);
  const CategoryModel = model('Category', CategorySchema);

  // Make sure every category our pools reference exists. Real product
  // filtering keys off `Category.slug` so the dropdown picks them up.
  for (const pool of POOLS) {
    await CategoryModel.updateOne(
      { slug: pool.category.slug },
      {
        $setOnInsert: {
          slug: pool.category.slug,
          name: pool.category.name,
          order: POOLS.indexOf(pool) + 1,
          active: true,
        },
      },
      { upsert: true },
    );
  }
  console.log(`✓ Ensured ${POOLS.length} categories exist.`);

  if (wipe) {
    const res = await ProductModel.deleteMany({ aiTags: SEED_TAG });
    console.log(`✓ Wiped ${res.deletedCount} previously-seeded dummy products.`);
  }

  let created = 0;
  let updated = 0;
  for (let i = 0; i < count; i++) {
    const pool = POOLS[i % POOLS.length]; // even distribution across categories
    const product = generate(i + 1, pool);
    const result = await ProductModel.updateOne(
      { slug: product.slug },
      { $set: product },
      { upsert: true },
    );
    if (result.upsertedCount) created += 1;
    else if (result.modifiedCount) updated += 1;
  }

  console.log(
    `\n✓ Done. ${created} created, ${updated} updated. Target: ${count}.`,
  );
  await disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await disconnect();
  process.exit(1);
});
