import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TrendingSearch,
  TrendingSearchDocument,
} from './schemas/trending-search.schema';

/**
 * Tracks committed search terms and serves the "trending searches"
 * leaderboard.
 *
 * Counts are *monotonic* — we never decay them on the server because
 * the read path always sorts by `count` desc anyway, and the index
 * makes that O(log n). When we move to a real ranking model we can
 * pre-compute a `score = count * exp(-age/τ)` field in a cron job.
 */
@Injectable()
export class TrendingSearchService {
  constructor(
    @InjectModel(TrendingSearch.name)
    private readonly model: Model<TrendingSearchDocument>,
  ) {}

  /**
   * Track a single search submission. Best-effort: any error is
   * swallowed so a slow Mongo write never blocks the search response.
   */
  async track(term: string): Promise<void> {
    const normalized = term.trim().toLowerCase();
    if (normalized.length < 2 || normalized.length > 80) return;
    // Reject obvious junk — anything that's purely punctuation/whitespace.
    if (!/[a-z0-9]/i.test(normalized)) return;
    try {
      await this.model
        .updateOne(
          { term: normalized },
          {
            $inc: { count: 1 },
            $set: {
              display: titleCase(term.trim()),
              lastSearchedAt: new Date(),
            },
          },
          { upsert: true },
        )
        .exec();
    } catch {
      // Tracking is fire-and-forget — failures must not propagate.
    }
  }

  /** Top {@link limit} terms by lifetime count, freshest as tie-break. */
  async top(limit = 10): Promise<{ term: string; count: number }[]> {
    const docs = await this.model
      .find({ count: { $gte: 1 } })
      .sort({ count: -1, lastSearchedAt: -1 })
      .limit(Math.max(1, Math.min(limit, 25)))
      .lean()
      .exec();
    return docs.map((d) => ({ term: d.display ?? d.term, count: d.count }));
  }
}

/** "leather Tote" → "Leather Tote". Keeps existing all-caps acronyms. */
function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) =>
      w.length <= 2
        ? w.toLowerCase()
        : w[0].toUpperCase() + w.slice(1).toLowerCase(),
    )
    .join(' ');
}
