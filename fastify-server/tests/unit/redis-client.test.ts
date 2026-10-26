import { beforeEach, describe, expect, it } from 'vitest';
import { RedisClient } from '../../src/infrastructure/redis/redis-client.js';

describe('RedisClient (Unit)', () => {
  let client: RedisClient;

  beforeEach(() => {
    client = new RedisClient();
  });

  it('manages connection lifecycle cleanly', async () => {
    expect(client.isConnected()).toBe(false);
    expect(client.getStatus()).toBe('disconnected');

    await client.connect();
    expect(client.isConnected()).toBe(true);
    expect(client.getStatus()).toBe('connected');

    const pingRes = await client.ping();
    expect(pingRes).toBe('PONG');

    await client.disconnect();
    expect(client.isConnected()).toBe(false);
    expect(client.getStatus()).toBe('disconnected');
  });

  it('stores, retrieves, and checks existence of keys', async () => {
    await client.connect();

    const setRes = await client.set('test:key:1', 'hello-world');
    expect(setRes).toBe(true);

    const exists = await client.exists('test:key:1');
    expect(exists).toBe(true);

    const val = await client.get('test:key:1');
    expect(val).toBe('hello-world');

    const deleted = await client.del('test:key:1');
    expect(deleted).toBe(true);

    const afterDel = await client.get('test:key:1');
    expect(afterDel).toBeNull();
  });

  it('handles TTL expiration safely', async () => {
    await client.connect();

    // Set with 0 or negative TTL should not be permanently cached
    await client.set('test:expiring', 'temporary', -1);
    const immediate = await client.get('test:expiring');
    expect(immediate).toBeNull();
  });

  it('deletes keys by pattern', async () => {
    await client.connect();

    await client.set('catalog:product:1', 'p1');
    await client.set('catalog:product:2', 'p2');
    await client.set('catalog:category:1', 'c1');

    const deleted = await client.delPattern('catalog:product:*');
    expect(deleted).toBe(2);

    expect(await client.get('catalog:product:1')).toBeNull();
    expect(await client.get('catalog:product:2')).toBeNull();
    expect(await client.get('catalog:category:1')).toBe('c1');
  });

  it('tracks operational metrics and health status', async () => {
    await client.connect();

    await client.set('key1', 'val1');
    await client.get('key1'); // hit
    await client.get('missing'); // miss

    const metrics = client.getMetrics();
    expect(metrics.totalCommandsExecuted).toBeGreaterThan(0);
    expect(metrics.cacheHits).toBe(1);
    expect(metrics.cacheMisses).toBe(1);

    const health = await client.getHealth();
    expect(health.isConnected).toBe(true);
    expect(health.status).toBe('connected');
    expect(health.latencyMs).toBeDefined();
  });
});
