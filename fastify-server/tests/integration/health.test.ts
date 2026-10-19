import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { healthService } from '../../src/modules/health/health.service.js';

describe('Health Endpoints (Integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const mockPrisma = {
      $queryRawUnsafe: vi.fn().mockResolvedValue([{ '?column?': 1 }]),
      $disconnect: vi.fn().mockResolvedValue(undefined),
    } as unknown as PrismaClient;

    const env = loadEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      SWAGGER_ENABLED: 'false',
      API_PREFIX: '/api/v1',
    });
    app = await buildApp({
      env,
      fastifyOptions: { logger: false },
      disableRateLimit: true,
      prismaOverride: mockPrisma,
    });
    await app.ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/v1/health/live should return 200 with process health data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.status).toBe('ok');
    expect(typeof payload.uptime).toBe('number');
    expect(payload.timestamp).toBeDefined();
  });

  it('GET /api/v1/health/ready should return 200 when all system checks are up', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/ready',
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.status).toBe('ready');
    expect(payload.checks).toBeDefined();
    expect(payload.checks.system.status).toBe('up');
    expect(payload.checks.database.status).toBe('up');
  });

  it('GET /api/v1/health/ready should return 503 when a registered check reports down', async () => {
    healthService.registerReadinessCheck('mock-subsystem', () => ({
      status: 'down',
      message: 'Subsystem initialization error',
    }));

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/health/ready',
      });

      expect(response.statusCode).toBe(503);
      const payload = response.json();
      expect(payload.status).toBe('unavailable');
      expect(payload.checks['mock-subsystem']?.status).toBe('down');
    } finally {
      healthService.unregisterReadinessCheck('mock-subsystem');
    }
  });
});
