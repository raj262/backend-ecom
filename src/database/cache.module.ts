import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createKeyv } from '@keyv/redis';
import { CacheableMemory } from 'cacheable';
import { Keyv } from 'keyv';

/**
 * App-wide cache with tiered storage.
 *
 *  - **L1 (always on):** in-process LRU, microsecond reads, capped at 5k keys.
 *  - **L2 (optional):** Redis, shared across instances. Enabled by setting
 *    `REDIS_URL` in the environment.
 *
 * Keyv writes to every store and reads in order, so cold reads hit Redis,
 * warm reads hit the in-process LRU. Code that calls `CACHE_MANAGER.get/set`
 * is identical regardless of mode.
 *
 * TTLs are in **milliseconds** (cache-manager v7 convention).
 */
@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        const stores: Keyv[] = [
          new Keyv({
            store: new CacheableMemory({ ttl: 60_000, lruSize: 5000 }),
          }),
        ];
        if (redisUrl) {
          stores.push(createKeyv(redisUrl));
          Logger.log(`Redis cache enabled @ ${maskUrl(redisUrl)}`, 'Cache');
        } else {
          Logger.warn(
            'REDIS_URL not set — using in-process cache only (single-instance).',
            'Cache',
          );
        }
        return { stores, ttl: 60_000 };
      },
    }),
  ],
  exports: [NestCacheModule],
})
export class AppCacheModule {}

function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return 'redis://***';
  }
}
