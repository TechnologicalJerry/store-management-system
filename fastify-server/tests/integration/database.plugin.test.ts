import { describe, expect, it, vi } from 'vitest';
import fastify from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { databasePlugin } from '../../src/infrastructure/database/database.plugin.js';
import { loadEnv } from '../../src/config/env.js';

describe('Database Fastify Plugin (Integration)', () => {
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test_db?schema=public',
  });

  it('should decorate FastifyInstance with app.prisma', async () => {
    const mockPrisma = {
      $disconnect: vi.fn().mockResolvedValue(undefined),
    } as unknown as PrismaClient;

    const app = fastify({ logger: false });

    await app.register(databasePlugin, {
      env,
      prismaOverride: mockPrisma,
    });

    await app.ready();

    expect(app.hasDecorator('prisma')).toBe(true);
    expect(app.prisma).toBe(mockPrisma);

    await app.close();
    expect(mockPrisma.$disconnect).toHaveBeenCalledOnce();
  });

  it('should make app.prisma accessible within route handlers', async () => {
    const mockPrisma = {
      $disconnect: vi.fn().mockResolvedValue(undefined),
      systemSetting: {
        count: vi.fn().mockResolvedValue(4),
      },
    } as unknown as PrismaClient;

    const app = fastify({ logger: false });

    await app.register(databasePlugin, {
      env,
      prismaOverride: mockPrisma,
    });

    app.get('/test-db-access', async (request, reply) => {
      const count = await request.server.prisma.systemSetting.count();
      return reply.send({ count });
    });

    await app.ready();

    const response = await app.inject({
      method: 'GET',
      url: '/test-db-access',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ count: 4 });

    await app.close();
  });
});
