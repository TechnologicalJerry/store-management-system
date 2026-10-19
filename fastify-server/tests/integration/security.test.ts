import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';

describe('Security Plugins & Headers (Integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const mockPrisma = {
      $disconnect: vi.fn().mockResolvedValue(undefined),
    } as unknown as PrismaClient;

    const env = loadEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      SWAGGER_ENABLED: 'false',
      CORS_ORIGINS: 'http://allowed-origin.com,http://localhost:3000',
    });

    app = await buildApp({
      env,
      fastifyOptions: { logger: false },
      prismaOverride: mockPrisma,
    });
    await app.ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should include essential HTTP security headers in responses', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
    });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(response.headers['x-xss-protection']).toBe('0');
  });

  it('should allow CORS requests from configured origins with credentials', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
      headers: {
        origin: 'http://allowed-origin.com',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBe('http://allowed-origin.com');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('should reject or deny CORS requests from unauthorized origins', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health/live',
      headers: {
        origin: 'http://malicious-attacker.com',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('should reject request bodies exceeding the 1MB payload limit with 413', async () => {
    // Generate a payload slightly exceeding 1MB (1048576 bytes)
    const largePayload = 'a'.repeat(1048576 + 100);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/health/live',
      headers: {
        'content-type': 'text/plain',
      },
      payload: largePayload,
    });

    expect(response.statusCode).toBe(413);
    const json = response.json();
    expect(json.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
