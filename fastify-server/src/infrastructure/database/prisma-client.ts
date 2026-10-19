import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import type { Env } from '../../config/env.js';
import type { DatabaseHealthResult } from './database.types.js';

const { Pool } = pg;

export interface PrismaClientBundle {
  prisma: PrismaClient;
  pool: pg.Pool;
}

/**
 * Creates a configured PostgreSQL connection pool and PrismaClient instance
 * leveraging the @prisma/adapter-pg driver adapter.
 */
export function createPrismaClient(env: Env): PrismaClientBundle {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DB_POOL_MAX,
    connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: 30000,
  });

  const adapter = new PrismaPg(pool);

  const prisma = new PrismaClient({
    adapter,
    log:
      env.NODE_ENV === 'development'
        ? [
            { emit: 'stdout', level: 'warn' },
            { emit: 'stdout', level: 'error' },
          ]
        : [{ emit: 'stdout', level: 'error' }],
  });

  return { prisma, pool };
}

/**
 * Executes a bounded lightweight connectivity check (SELECT 1).
 * Guaranteed to return within the timeout threshold without blocking server operations.
 */
export async function checkDatabaseConnection(
  prisma: PrismaClient,
  timeoutMs = 3000
): Promise<DatabaseHealthResult> {
  const start = performance.now();
  try {
    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Database health check timed out after ${timeoutMs}ms`)),
        timeoutMs
      );
    });

    try {
      await Promise.race([prisma.$queryRawUnsafe('SELECT 1'), timeoutPromise]);
    } finally {
      if (timer) clearTimeout(timer);
    }

    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    return {
      isConnected: true,
      latencyMs,
    };
  } catch (error) {
    return {
      isConnected: false,
      error: error instanceof Error ? error.message : 'Database ping query failed',
    };
  }
}

/**
 * Safely disconnects the Prisma client and drains the underlying PostgreSQL connection pool.
 */
export async function disconnectPrisma(
  clientOrBundle: PrismaClientBundle | PrismaClient
): Promise<void> {
  if ('prisma' in clientOrBundle && 'pool' in clientOrBundle) {
    await Promise.allSettled([
      clientOrBundle.prisma.$disconnect(),
      clientOrBundle.pool.end(),
    ]);
  } else {
    await clientOrBundle.$disconnect();
  }
}

/**
 * Application-level cached singleton instance.
 */
let cachedBundle: PrismaClientBundle | null = null;

export function getSharedPrismaBundle(env: Env): PrismaClientBundle {
  if (!cachedBundle) {
    cachedBundle = createPrismaClient(env);
  }
  return cachedBundle;
}

export async function resetSharedPrismaBundle(): Promise<void> {
  if (cachedBundle) {
    await disconnectPrisma(cachedBundle);
    cachedBundle = null;
  }
}
