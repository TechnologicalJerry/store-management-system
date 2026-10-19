import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { BadRequestError } from '../../src/common/errors/app-error.js';

describe('Error Handling Conventions (Integration)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const mockPrisma = {
      $disconnect: vi.fn().mockResolvedValue(undefined),
    } as unknown as PrismaClient;

    const env = loadEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      SWAGGER_ENABLED: 'false',
    });

    app = await buildApp({
      env,
      fastifyOptions: { logger: false },
      disableRateLimit: true,
      prismaOverride: mockPrisma,
    });

    // Register test routes to simulate errors
    app.get('/test/operational-error', async () => {
      throw new BadRequestError('Invalid store branch identifier', { branchId: 'invalid-id' });
    });

    app.get('/test/unexpected-error', async () => {
      throw new Error('Unexpected catastrophic failure');
    });

    app.get('/test/prisma-error', async () => {
      const err = new Error('Unique constraint failed on the fields: (`key`)') as Error & {
        code: string;
        meta: { target: string[] };
      };
      err.code = 'P2002';
      err.meta = { target: ['key'] };
      throw err;
    });

    await app.ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should return a structured 404 response for unknown routes', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/non-existent-endpoint',
    });

    expect(response.statusCode).toBe(404);
    const json = response.json();
    expect(json.statusCode).toBe(404);
    expect(json.error).toBe('Not Found');
    expect(json.code).toBe('ROUTE_NOT_FOUND');
    expect(json.message).toContain('/api/v1/non-existent-endpoint');
    expect(json.requestId).toBeDefined();
    expect(json.timestamp).toBeDefined();
  });

  it('should format operational AppErrors with appropriate status and details', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/operational-error',
    });

    expect(response.statusCode).toBe(400);
    const json = response.json();
    expect(json.statusCode).toBe(400);
    expect(json.error).toBe('Bad Request');
    expect(json.code).toBe('BAD_REQUEST');
    expect(json.message).toBe('Invalid store branch identifier');
    expect(json.details).toEqual({ branchId: 'invalid-id' });
    expect(json.requestId).toBeDefined();
  });

  it('should catch unhandled Prisma errors and map to safe 409 Conflict', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/prisma-error',
    });

    expect(response.statusCode).toBe(409);
    const json = response.json();
    expect(json.statusCode).toBe(409);
    expect(json.error).toBe('Conflict');
    expect(json.code).toBe('UNIQUE_CONSTRAINT_VIOLATION');
    expect(json.message).toContain('unique key already exists');
    expect(json.requestId).toBeDefined();
  });

  it('should catch unexpected errors and return consistent 500 structure', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/test/unexpected-error',
    });

    expect(response.statusCode).toBe(500);
    const json = response.json();
    expect(json.statusCode).toBe(500);
    expect(json.error).toBe('Internal Server Error');
    expect(json.code).toBe('INTERNAL_SERVER_ERROR');
    expect(json.requestId).toBeDefined();
  });

  it('should preserve and propagate custom x-request-id header', async () => {
    const customReqId = 'corr-uuid-12345';
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/non-existent-endpoint',
      headers: {
        'x-request-id': customReqId,
      },
    });

    const json = response.json();
    expect(json.requestId).toBe(customReqId);
  });
});
