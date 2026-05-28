import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';

export interface ChatIntent {
  intent:
    | 'greeting'
    | 'order-status'
    | 'returns'
    | 'shipping'
    | 'product-search'
    | 'gift'
    | 'compare'
    | 'fallback';
  confidence: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatProductCard {
  id: string;
  name: string;
  slug: string;
  brand: string;
  price: number;
  image: string;
}

export interface ChatReply {
  reply: string;
  intent: ChatIntent['intent'];
  products: ChatProductCard[];
  suggestions: string[];
}

/**
 * Server-side AI helpers. Everything here is currently rule-based — the
 * shape is what matters so we can swap in an LLM (OpenAI, Bedrock, etc.)
 * later without changing the controller / clients.
 */
@Injectable()
export class AiService {
  constructor(
    @InjectModel(Product.name)
    private readonly products: Model<ProductDocument>,
    @InjectModel(Order.name)
    private readonly orders: Model<OrderDocument>,
  ) {}

  /**
   * Personalised "For you" rail. Mines the user's last 50 orders for
   * categories, brands, and aiTags, builds a weighted taste profile,
   * then scores every active product by overlap. Falls back to top-
   * rated catalog items for cold-start users with no order history.
   *
   * This runs cheap aggregations only — no LLM call — so a server
   * with even one CPU can render the home rail in well under 100 ms.
   */
  async forYou(userId: string, limit = 12) {
    if (!Types.ObjectId.isValid(userId)) {
      return this.coldStart(limit);
    }
    const uid = new Types.ObjectId(userId);
    const orders = await this.orders
      .find({ userId: uid })
      .sort({ createdAt: -1 })
      .limit(50)
      .select('items')
      .lean()
      .exec();

    // Cold-start: nobody has ordered yet → just return the catalog's
    // best-rated stuff so the rail isn't empty.
    if (orders.length === 0) return this.coldStart(limit);

    const productIds = new Set<string>();
    orders.forEach((o) =>
      (o.items as Array<{ productId: Types.ObjectId }>).forEach((it) =>
        productIds.add(it.productId.toString()),
      ),
    );
    const purchased = await this.products
      .find({ _id: { $in: [...productIds].map((s) => new Types.ObjectId(s)) } })
      .select('category brand aiTags')
      .lean()
      .exec();

    // Build the taste profile. We weight categories ×3 (they're the
    // strongest signal), brands ×2, then ai tags ×1.
    const categoryW = new Map<string, number>();
    const brandW = new Map<string, number>();
    const tagW = new Map<string, number>();
    for (const p of purchased) {
      bumpMap(categoryW, p.category as string | undefined, 3);
      bumpMap(brandW, p.brand as string | undefined, 2);
      for (const tag of (p.aiTags as string[] | undefined) ?? []) {
        bumpMap(tagW, tag, 1);
      }
    }

    // Pull a wide candidate pool (≤200) limited to the user's known
    // categories so the scoring stays cheap, then re-rank in JS.
    const candidateFilter: Record<string, unknown> = {
      _id: { $nin: [...productIds].map((s) => new Types.ObjectId(s)) },
      active: true,
    };
    const knownCategories = [...categoryW.keys()];
    if (knownCategories.length > 0) {
      candidateFilter.$or = [
        { category: { $in: knownCategories } },
        { brand: { $in: [...brandW.keys()] } },
        { aiTags: { $in: [...tagW.keys()] } },
      ];
    }
    const candidates = await this.products
      .find(candidateFilter)
      .sort({ rating: -1, popularity: -1 })
      .limit(200)
      .exec();

    const scored = candidates.map((p) => {
      let score = 0;
      score += (categoryW.get(p.category as string) ?? 0) * 1.5;
      score += brandW.get(p.brand as string) ?? 0;
      for (const tag of p.aiTags ?? []) {
        score += tagW.get(tag) ?? 0;
      }
      // Small "freshness" bump: newer products edge out equally-
      // matching older ones.
      const age = Date.now() - new Date((p as { createdAt?: Date }).createdAt ?? Date.now()).getTime();
      const freshness = Math.max(0, 1 - age / (90 * 24 * 60 * 60 * 1000));
      score += freshness * 0.5;
      return { product: p, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.filter((s) => s.score > 0).slice(0, limit);
    if (top.length >= limit) return top.map((s) => s.product);

    // If scoring didn't surface enough, top-up with cold-start picks.
    const seen = new Set(top.map((s) => s.product._id.toString()));
    productIds.forEach((p) => seen.add(p));
    const padding = await this.coldStart(limit - top.length, [...seen]);
    return [...top.map((s) => s.product), ...padding];
  }

  /**
   * Cold-start fallback for users with no purchase signal. Pulls the
   * highest-rated active products and pads with top popularity.
   */
  private async coldStart(limit: number, exclude: string[] = []) {
    return this.products
      .find({
        active: true,
        ...(exclude.length > 0 && {
          _id: { $nin: exclude.map((s) => new Types.ObjectId(s)) },
        }),
      })
      .sort({ rating: -1, popularity: -1 })
      .limit(limit)
      .exec();
  }

  /** "You may also like" → tag-overlap recommendation. */
  async recommend(productId: string, limit = 6) {
    if (!Types.ObjectId.isValid(productId)) return [];
    const seed = await this.products.findById(productId).exec();
    if (!seed) return [];
    return this.products
      .find({
        _id: { $ne: seed._id },
        active: true,
        $or: [
          { category: seed.category },
          { brand: seed.brand },
          { aiTags: { $in: seed.aiTags ?? [] } },
        ],
      })
      .sort({ popularity: -1, rating: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * "Frequently bought together" — finds products that co-occur in the
   * same order as the seed, ranked by co-occurrence count.
   *
   * Falls back to top-rated products in the same category when there's
   * not enough order signal yet (typical for cold catalogs). The
   * fallback path guarantees the widget always renders something useful
   * instead of degrading to an empty list.
   */
  async boughtTogether(productId: string, limit = 3) {
    if (!Types.ObjectId.isValid(productId)) return [];
    const seed = await this.products.findById(productId).exec();
    if (!seed) return [];

    const oid = new Types.ObjectId(productId);
    const fromOrders = await this.orders.aggregate<{
      _id: Types.ObjectId;
      count: number;
    }>([
      { $match: { 'items.productId': oid } },
      { $unwind: '$items' },
      // Drop the seed itself — we only want *other* items in those orders.
      { $match: { 'items.productId': { $ne: oid } } },
      { $group: { _id: '$items.productId', count: { $sum: '$items.quantity' } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);

    // Resolve the co-occurring product ids in their ranked order.
    const realIds = fromOrders.map((r) => r._id);
    const real =
      realIds.length > 0
        ? await this.products
            .find({ _id: { $in: realIds }, active: true })
            .exec()
        : [];
    const realById = new Map(real.map((p) => [p._id.toString(), p]));
    const ranked = realIds.flatMap((id) => {
      const p = realById.get(id.toString());
      return p ? [p] : [];
    });

    if (ranked.length >= limit) return ranked.slice(0, limit);

    // Cold-start fallback — top up with top-rated category mates.
    const seen = new Set<string>(ranked.map((p) => p._id.toString()));
    seen.add(seed._id.toString());
    const fallback = await this.products
      .find({
        _id: { $nin: Array.from(seen).map((s) => new Types.ObjectId(s)) },
        category: seed.category,
        active: true,
      })
      .sort({ rating: -1, popularity: -1 })
      .limit(limit - ranked.length)
      .exec();
    return [...ranked, ...fallback];
  }

  /** Autocomplete with case-insensitive match on name + brand + AI tags. */
  async autocomplete(q: string, limit = 8) {
    if (!q || q.length < 2) return [];
    const rx = new RegExp(escapeRegex(q), 'i');
    return this.products
      .find({
        active: true,
        $or: [{ name: rx }, { brand: rx }, { aiTags: rx }],
      })
      .select('name slug images price')
      .limit(limit)
      .exec();
  }

  /** Tiny intent classifier for the chatbot. */
  classify(message: string): ChatIntent {
    const m = message.toLowerCase();
    const rules: Array<[RegExp, ChatIntent['intent']]> = [
      [/^(hi|hello|hey|namaste|hola|yo)\b/, 'greeting'],
      [/\b(order|track|status|where('s| is) my)\b/, 'order-status'],
      [/\b(return|refund|exchange)\b/, 'returns'],
      [/\b(ship|delivery|cod|express|when (do|will) (it|you) arrive)\b/, 'shipping'],
      [/\b(gift|present|surprise)\b/, 'gift'],
      [/\b(compare|vs\.?|versus|difference between)\b/, 'compare'],
      [/\b(find|search|recommend|show|need|looking for|something|some)\b/, 'product-search'],
    ];
    for (const [rx, intent] of rules) {
      if (rx.test(m)) return { intent, confidence: 0.8 };
    }
    return { intent: 'fallback', confidence: 0.3 };
  }

  // ------------------------------------------------------------------
  // Conversational chat ("Lumi")
  // ------------------------------------------------------------------

  /**
   * Conversational chat brain. Today the implementation is a curated
   * rule + product-search loop:
   *
   *   1. classify the intent
   *   2. extract keywords (after stripping stop-words)
   *   3. for product-style intents, hit the catalog and surface 4
   *      relevant cards
   *   4. compose a warm reply and a couple of suggested follow-ups
   *
   * The return shape is LLM-friendly so we can later swap the inside
   * for an OpenAI / Bedrock call without changing the mobile client.
   */
  async chat(
    message: string,
    _history: ChatMessage[] = [],
  ): Promise<ChatReply> {
    const intent = this.classify(message);
    const keywords = extractKeywords(message);

    switch (intent.intent) {
      case 'greeting': {
        const picks = await this.popular(4);
        return {
          reply:
            "Hi! I'm Lumi — your Lumière concierge. I can find pieces for any mood, sort out an order, or pick a gift. What are we hunting for today?",
          intent: intent.intent,
          products: picks.map(toCard),
          suggestions: [
            'Find me a date-night outfit',
            "What's trending right now?",
            'Track my latest order',
            'Help me pick a gift',
          ],
        };
      }
      case 'order-status':
        return {
          reply:
            "I can help with that. Open the Orders tab — you'll see live status for every recent purchase, plus tracking links once your order ships. If you tell me the order number, I can pull it up faster.",
          intent: intent.intent,
          products: [],
          suggestions: ['Show my latest order', 'How long does shipping take?', 'Track by number'],
        };
      case 'returns':
        return {
          reply:
            'Returns are easy: 30 days, free for our members, full refund to the original payment method. Most refunds land within 3–5 business days after we receive the item.',
          intent: intent.intent,
          products: [],
          suggestions: ['Start a return', 'Where do I ship returns?', 'Exchange instead of refund'],
        };
      case 'shipping':
        return {
          reply:
            'We offer Standard (3–5 days) and Express (1–2 days), with free shipping over ₹1,500. Cash-on-delivery is available across most pin codes in India.',
          intent: intent.intent,
          products: [],
          suggestions: ['Do you ship to my city?', 'Express shipping cost', 'Tell me about COD'],
        };
      case 'gift': {
        // Sale + new combo, capped to 4, gives a "thoughtful pick" vibe.
        const items = await this.products
          .find({ active: true, $or: [{ isFeatured: true }, { isNew: true }] })
          .sort({ popularity: -1 })
          .limit(4)
          .exec();
        return {
          reply:
            "Lovely — gifts are my favourite. Here are a few crowd-pleasers that arrive in our signature reusable box. Want me to narrow it down by budget or occasion?",
          intent: intent.intent,
          products: items.map(toCard),
          suggestions: [
            'Under ₹2,000',
            'For her',
            'For him',
            'Pair it with a card',
          ],
        };
      }
      case 'compare':
      case 'product-search': {
        const items = await this.searchByKeywords(keywords, 4);
        if (items.length === 0) {
          const fallback = await this.popular(4);
          return {
            reply:
              "I couldn't find a perfect match for that just yet — but our team adds new pieces every week. Here's what's catching everyone's eye today:",
            intent: intent.intent,
            products: fallback.map(toCard),
            suggestions: [
              "What's new in?",
              'Show me something on sale',
              'Best sellers under ₹3,000',
            ],
          };
        }
        return {
          reply: phraseForSearch(intent.intent, keywords),
          intent: intent.intent,
          products: items.map(toCard),
          suggestions: [
            'Show more like these',
            'Anything under ₹2,000?',
            'Compare the top two',
          ],
        };
      }
      case 'fallback':
      default: {
        const items = await this.searchByKeywords(keywords, 4);
        return {
          reply:
            items.length > 0
              ? "Here are a few pieces that match what you said — tell me what you'd tweak and I'll refine the picks."
              : "I'm still learning that one! Try asking me to find something specific, track an order, or help you pick a gift.",
          intent: intent.intent,
          products: items.map(toCard),
          suggestions: [
            'Find a silk dress',
            'Show new arrivals',
            'Track my order',
            'Recommend a gift',
          ],
        };
      }
    }
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private async popular(limit: number) {
    return this.products
      .find({ active: true })
      .sort({ popularity: -1, rating: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * Broad keyword match — name + brand + category + AI tags. We
   * intersect the keywords as an $and of $or matches so multi-word
   * queries (e.g. "linen black dress") get tighter results than a
   * single OR.
   */
  private async searchByKeywords(keywords: string[], limit: number) {
    if (keywords.length === 0) return this.popular(limit);
    const ands = keywords.slice(0, 4).map((kw) => {
      const rx = new RegExp(escapeRegex(kw), 'i');
      return {
        $or: [
          { name: rx },
          { brand: rx },
          { category: rx },
          { aiTags: rx },
          { description: rx },
        ],
      };
    });
    return this.products
      .find({ active: true, $and: ands })
      .sort({ popularity: -1, rating: -1 })
      .limit(limit)
      .exec();
  }
}

// ----------------------------------------------------------------------------
// Pure helpers
// ----------------------------------------------------------------------------

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'the', 'is', 'are', 'i', 'me', 'my', 'we', 'us',
  'you', 'your', 'this', 'that', 'these', 'those', 'for', 'with',
  'of', 'on', 'in', 'to', 'from', 'by', 'at', 'as', 'be', 'do', 'have',
  'has', 'had', 'can', 'could', 'should', 'would', 'will', 'shall',
  'find', 'search', 'recommend', 'show', 'me', 'something', 'some',
  'need', 'want', 'looking', 'help', 'please', 'thanks', 'thank',
  'hi', 'hello', 'hey', 'okay', 'ok', "what's", 'whats', 'where', 'how',
]);

function extractKeywords(message: string): string[] {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    .slice(0, 6);
}

function phraseForSearch(
  intent: ChatIntent['intent'],
  keywords: string[],
): string {
  const subject = keywords.length > 0 ? keywords.join(' ') : 'that';
  if (intent === 'compare') {
    return `Happy to compare. Here are the top picks for "${subject}" — want me to pull up specs side-by-side or call out the standout choice?`;
  }
  return `Found a few favourites for "${subject}". Each one ships within 48 hours — want to refine by colour, size, or budget?`;
}

function toCard(p: ProductDocument): ChatProductCard {
  return {
    id: p._id.toString(),
    name: p.name,
    slug: p.slug,
    brand: p.brand ?? 'Lumière',
    price: p.price,
    image: p.images?.[0] ?? '',
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Increments `map[key]` by `weight` if `key` is a non-empty string. */
function bumpMap(
  map: Map<string, number>,
  key: string | undefined,
  weight: number,
): void {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + weight);
}
