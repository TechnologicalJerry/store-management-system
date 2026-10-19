import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';

describe('Database Readiness Probe Integration', () => {
  it('should return 200 ready when database connectivity is healthy', async () => {
    const mockPrisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
      $disconnect: vi.fn().mockResolvedValue(undefined),
    } as unknown as PrismaClient;

    const env = loadEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      SWAGGER_ENABLED: 'false',
    });

    const app = await buildApp({
      env,
      fastifyOptions: { logger: false },
      disableRateLimit: true,
      prismaOverride: mockPrisma,
    });

    await app.ready();

    // 1. Liveness check should pass
    const liveRes = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
    });
    expect(liveRes.statusCode).toBe(200);
    expect(liveRes.json().status).toBe('ok');

    // 2. Readiness check should pass and include database up
    const readyRes = await app.inject({
      method: 'GET',
      url: '/api/v1/health/ready',
    });
    expect(readyRes.statusCode).toBe(200);
    const readyJson = readyRes.json();
    expect(readyJson.status).toBe('ready');
    expect(readyJson.checks.database).toBeDefined();
    expect(readyJson.checks.database.status).toBe('up');

    await app.close();
  });

  it('should return 503 unavailable when database connectivity fails', async () => {
    const mockPrisma = {
      $queryRawUnsafe: vi.fn().mockRejectedValue(new Error('Connection timeout to PostgreSQL:5432')),
      $disconnect: vi.fn().mockResolvedValue(undefined),
    } as unknown as PrismaClient;

    const env = loadEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      SWAGGER_ENABLED: 'false',
    });

    const app = await buildApp({
      env,
      fastifyOptions: { logger: false },
      disableRateLimit: true,
      prismaOverride: mockPrisma,
    });

    await app.ready();

    // 1. Liveness must remain 200 OK even if database is down
    const liveRes = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
    });
    expect(liveRes.statusCode).toBe(200);
    expect(liveRes.json().status).toBe('ok');

    // 2. Readiness must fail with 503
    const readyRes = await app.inject({
      method: 'GET',
      url: '/api/v1/health/ready',
    });
    expect(readyRes.statusCode).toBe(503);
    const readyJson = readyRes.json();
    expect(readyJson.status).toBe('unavailable');
    expect(readyJson.checks.database.status).toBe('down');
    expect(readyJson.checks.database.message).toBe('PostgreSQL database connection is unavailable');

    // Ensure connection details or raw error details are never leaked
    expect(JSON.stringify(readyJson)).not.toContain('PostgreSQL:5432');

    await app.close();
  });
});
