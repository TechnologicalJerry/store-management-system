import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  checkDatabaseConnection,
  createPrismaClient,
  disconnectPrisma,
} from '../../src/infrastructure/database/prisma-client.js';
import { loadEnv } from '../../src/config/env.js';

describe('Database Client & Health Check (Unit)', () => {
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test_db?schema=public',
    DB_POOL_MAX: '5',
    DB_CONNECTION_TIMEOUT_MS: '2000',
  });

  it('should instantiate PrismaClient and pg.Pool bundle from environment', () => {
    const bundle = createPrismaClient(env);
    expect(bundle).toBeDefined();
    expect(bundle.prisma).toBeDefined();
    expect(bundle.pool).toBeDefined();
    expect(bundle.pool.options.max).toBe(5);
  });

  it('should report healthy connection when SELECT 1 succeeds', async () => {
    const mockPrisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
    } as unknown as PrismaClient;

    const result = await checkDatabaseConnection(mockPrisma, 1000);
    expect(result.isConnected).toBe(true);
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it('should report failure when SELECT 1 rejects', async () => {
    const mockPrisma = {
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error('Connection refused at 5432')),
    } as unknown as PrismaClient;

    const result = await checkDatabaseConnection(mockPrisma, 1000);
    expect(result.isConnected).toBe(false);
    expect(result.error).toContain('Connection refused');
    expect(result.latencyMs).toBeUndefined();
  });

  it('should timeout and report failure when query hangs longer than threshold', async () => {
    const mockPrisma = {
      $queryRawUnsafe: vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 500))
      ),
    } as unknown as PrismaClient;

    // Timeout threshold set to 50ms, query takes 500ms
    const result = await checkDatabaseConnection(mockPrisma, 50);
    expect(result.isConnected).toBe(false);
    expect(result.error).toContain('timed out');
  });

  it('should cleanly disconnect prisma client and end pool', async () => {
    const mockPrisma = {
      $disconnect: vi.fn().mockResolvedValue(undefined),
    } as unknown as PrismaClient;
    const mockPool = {
      end: vi.fn().mockResolvedValue(undefined),
    } as unknown as { end: () => Promise<void> };

    await disconnectPrisma({ prisma: mockPrisma, pool: mockPool as never });
    expect(mockPrisma.$disconnect).toHaveBeenCalledOnce();
    expect(mockPool.end).toHaveBeenCalledOnce();
  });
});
