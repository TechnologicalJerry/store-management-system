import { getEnv } from '../../config/env.js';
import { logger } from '../../common/utils/logger.js';
import type { IRedisClient, CacheOptions } from './redis.types.js';
import { getRedisClient } from './redis-client.js';
import { getMetricsService } from '../observability/metrics.service.js';

/**
 * CacheService
 *
 * Provides a high-level, typed, cache-aside abstraction with versioned and
 * namespaced keys, configurable TTLs, stampede protection (promise coalescing),
 * safe error handling, and structured logging.
 *
 * PostgreSQL remains the authoritative source of truth.
 * Redis is strictly an ephemeral accelerator.
 */
export class CacheService {
  private redis: IRedisClient;
  private readonly defaultTtl: number;
  private readonly productTtl: number;
  private readonly storeTtl: number;
  private readonly keyVersion = 'v1';

  // In-memory inflight promise map for stampede protection (coalescing simultaneous cache misses)
  private readonly inflightRequests = new Map<string, Promise<unknown>>();

  constructor(redisClient?: IRedisClient) {
    this.redis = redisClient ?? getRedisClient();
    const env = getEnv();
    this.defaultTtl = env.CACHE_DEFAULT_TTL_SECONDS ?? 300;
    this.productTtl = env.CACHE_PRODUCT_TTL_SECONDS ?? 600;
    this.storeTtl = env.CACHE_STORE_TTL_SECONDS ?? 1800;
  }

  /**
   * Builds a standardized versioned and namespaced cache key.
   * Example: `v1:catalog:product:123`
   */
  public buildKey(namespace: string, key: string, version: string = this.keyVersion): string {
    return `${version}:${namespace}:${key}`;
  }

  /**
   * Retrieves a typed value from cache.
   * Gracefully returns null on cache miss, malformed JSON, or Redis error.
   */
  public async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) {
        getMetricsService().recordCacheMiss();
        return null;
      }

      try {
        const parsed = JSON.parse(raw) as T;
        getMetricsService().recordCacheHit();
        return parsed;
      } catch (parseErr) {
        getMetricsService().recordCacheMiss();
        logger.warn(
          { key, err: (parseErr as Error).message },
          'Malformed JSON detected in cache; purging corrupted key'
        );
        // Best-effort cleanup of malformed entry
        void this.redis.del(key);
        return null;
      }
    } catch (err) {
      getMetricsService().recordCacheMiss();
      logger.warn(
        { key, err: (err as Error).message },
        'Cache read error; falling back to authoritative database'
      );
      return null;
    }
  }

  /**
   * Sets a typed value in cache with a TTL.
   */
  public async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const effectiveTtl = ttlSeconds ?? this.defaultTtl;
      const serialized = JSON.stringify(value);
      await this.redis.set(key, serialized, effectiveTtl);
    } catch (err) {
      logger.warn(
        { key, err: (err as Error).message },
        'Cache write error; continuing with database as source of truth'
      );
    }
  }

  /**
   * Deletes a single key from cache.
   */
  public async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (err) {
      logger.warn({ key, err: (err as Error).message }, 'Cache delete error during invalidation');
    }
  }

  /**
   * Deletes all keys matching a wildcard pattern.
   * Example: `v1:catalog:product:*`
   */
  public async delPattern(pattern: string): Promise<number> {
    try {
      const count = await this.redis.delPattern(pattern);
      logger.debug({ pattern, deletedCount: count }, 'Invalidated cache entries by pattern');
      return count;
    } catch (err) {
      logger.warn(
        { pattern, err: (err as Error).message },
        'Cache pattern invalidation error'
      );
      return 0;
    }
  }

  /**
   * Cache-Aside with stampede protection (Promise Coalescing).
   *
   * If the item is cached, returns it immediately.
   * If multiple concurrent requests hit the same missing key, only one fetcher executes
   * while others await the single in-flight Promise.
   */
  public async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    // 1. Check cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // 2. Prevent cache stampede via in-flight request coalescing
    const existingPromise = this.inflightRequests.get(key);
    if (existingPromise) {
      return (await existingPromise) as T;
    }

    const fetchPromise = (async () => {
      try {
        const fetchedData = await fetcher();
        if (fetchedData !== undefined && fetchedData !== null) {
          const ttl = options?.ttlSeconds ?? this.defaultTtl;
          await this.set(key, fetchedData, ttl);
        }
        return fetchedData;
      } finally {
        this.inflightRequests.delete(key);
      }
    })();

    this.inflightRequests.set(key, fetchPromise);
    return (await fetchPromise) as T;
  }

  // ============================================================================
  // Specialized Invalidation Helpers
  // ============================================================================

  /**
   * Invalidate cached product details and listings.
   */
  public async invalidateProduct(productId: string): Promise<void> {
    await this.del(this.buildKey('catalog:product', productId));
    await this.delPattern(this.buildKey('catalog', 'products:*'));
    logger.info({ productId }, 'Invalidated product cache');
  }

  /**
   * Invalidate cached category details and category trees.
   */
  public async invalidateCategory(categoryId: string): Promise<void> {
    await this.del(this.buildKey('catalog:category', categoryId));
    await this.delPattern(this.buildKey('catalog', 'categories:*'));
    logger.info({ categoryId }, 'Invalidated category cache');
  }

  /**
   * Invalidate cached store metadata.
   */
  public async invalidateStore(storeId: string): Promise<void> {
    await this.del(this.buildKey('store:meta', storeId));
    await this.delPattern(this.buildKey('store', `${storeId}:*`));
    logger.info({ storeId }, 'Invalidated store metadata cache');
  }

  /**
   * Invalidate cached reporting data for a specific store.
   */
  public async invalidateStoreReports(storeId: string): Promise<void> {
    await this.delPattern(this.buildKey('reports', `${storeId}:*`));
    logger.info({ storeId }, 'Invalidated store reports cache');
  }

  /**
   * Helper getters for standard TTLs
   */
  public getProductTtl(): number {
    return this.productTtl;
  }

  public getStoreTtl(): number {
    return this.storeTtl;
  }

  public getDefaultTtl(): number {
    return this.defaultTtl;
  }
}

// Global cache service singleton
let defaultCacheService: CacheService | null = null;

export function getCacheService(): CacheService {
  if (!defaultCacheService) {
    defaultCacheService = new CacheService();
  }
  return defaultCacheService;
}

export function resetCacheService(): void {
  defaultCacheService = null;
}
