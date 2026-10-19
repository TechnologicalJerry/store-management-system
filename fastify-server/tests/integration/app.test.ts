import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';

describe('Application Factory (Integration)', () => {
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
    await app.ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('should initialize Fastify without binding to a network port', () => {
    expect(app).toBeDefined();
    expect(app.server.listening).toBe(false);
  });

  it('should have registered foundational Fastify plugins and decorators', () => {
    expect(app.hasPlugin('@fastify/helmet')).toBe(true);
    expect(app.hasPlugin('@fastify/cors')).toBe(true);
    expect(app.hasDecorator('prisma')).toBe(true);
  });
});
