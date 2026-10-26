import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheService } from '../../src/infrastructure/redis/cache.service.js';
import { RedisClient } from '../../src/infrastructure/redis/redis-client.js';

describe('CacheService (Unit)', () => {
  let redis: RedisClient;
  let cache: CacheService;

  beforeEach(async () => {
    redis = new RedisClient();
    await redis.connect();
    cache = new CacheService(redis);
  });

  it('builds versioned and namespaced keys', () => {
    const key = cache.buildKey('catalog:product', '123');
    expect(key).toBe('v1:catalog:product:123');
  });

  it('handles cache hits, misses, and typed JSON roundtripping', async () => {
    const key = cache.buildKey('test', 'user');

    // Cache miss
    const missed = await cache.get<{ name: string }>(key);
    expect(missed).toBeNull();

    // Cache set
    await cache.set(key, { name: 'Alice' }, 60);

    // Cache hit
    const hit = await cache.get<{ name: string }>(key);
    expect(hit).toEqual({ name: 'Alice' });

    // Cache delete
    await cache.del(key);
    const afterDel = await cache.get(key);
    expect(afterDel).toBeNull();
  });

  it('handles malformed JSON in cache gracefully without throwing', async () => {
    const key = cache.buildKey('corrupt', 'data');
    await redis.set(key, '{ invalid json');

    const result = await cache.get(key);
    expect(result).toBeNull();

    // Key should have been cleaned up
    const afterPurge = await redis.get(key);
    expect(afterPurge).toBeNull();
  });

  it('protects against cache stampedes using in-flight request coalescing', async () => {
    const key = cache.buildKey('expensive', 'compute');
    let fetchCount = 0;

    const fetcher = async () => {
      fetchCount++;
      await new Promise(resolve => setTimeout(resolve, 50));
      return { answer: 42 };
    };

    // Trigger 5 concurrent getOrSet calls
    const results = await Promise.all([
      cache.getOrSet(key, fetcher),
      cache.getOrSet(key, fetcher),
      cache.getOrSet(key, fetcher),
      cache.getOrSet(key, fetcher),
      cache.getOrSet(key, fetcher),
    ]);

    // All should receive identical results
    for (const r of results) {
      expect(r).toEqual({ answer: 42 });
    }

    // Only one single database fetcher call should have executed
    expect(fetchCount).toBe(1);
  });

  it('invalidates product, category, and store caches correctly', async () => {
    const pKey = cache.buildKey('catalog:product', 'prod-100');
    const cKey = cache.buildKey('catalog:category', 'cat-200');
    const sKey = cache.buildKey('store:meta', 'store-300');

    await cache.set(pKey, { id: 'prod-100' });
    await cache.set(cKey, { id: 'cat-200' });
    await cache.set(sKey, { id: 'store-300' });

    await cache.invalidateProduct('prod-100');
    expect(await cache.get(pKey)).toBeNull();

    await cache.invalidateCategory('cat-200');
    expect(await cache.get(cKey)).toBeNull();

    await cache.invalidateStore('store-300');
    expect(await cache.get(sKey)).toBeNull();
  });
});
