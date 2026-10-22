import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

describe('Category Routes (Integration)', () => {
  let app: FastifyInstance;
  let mockPrisma: PrismaClient;
  let adminToken: string;

  const adminUserId = '550e8400-e29b-41d4-a716-446655440000';
  const testSessionId = '660e8400-e29b-41d4-a716-446655440001';
  const categoryId = '990e8400-e29b-41d4-a716-446655440004';

  const sampleAdminUser = {
    id: adminUserId,
    email: 'admin@store.local',
    name: 'System Admin',
    status: 'ACTIVE',
    roles: [{ id: 'r1', userId: adminUserId, role: 'SUPER_ADMIN' }],
  };

  const sampleCategory = {
    id: categoryId,
    name: 'Snacks & Confectionery',
    slug: 'snacks-confectionery',
    description: 'Crisps, chocolates, sweets',
    parentId: null,
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    parent: null,
  };

  const sampleSession = {
    id: testSessionId,
    userId: adminUserId,
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };

  beforeAll(async () => {
    mockPrisma = {
      $disconnect: vi.fn().mockResolvedValue(undefined),
      user: {
        findUnique: vi.fn().mockResolvedValue(sampleAdminUser),
      },
      session: {
        findUnique: vi.fn().mockResolvedValue(sampleSession),
      },
      productCategory: {
        findUnique: vi.fn().mockImplementation(({ where }) => {
          if (where.id === categoryId || where.slug === 'snacks-confectionery') {
            return Promise.resolve(sampleCategory);
          }
          return Promise.resolve(null);
        }),
        create: vi.fn().mockResolvedValue(sampleCategory),
        update: vi.fn().mockImplementation(({ data }) => {
          return Promise.resolve({ ...sampleCategory, ...data });
        }),
        delete: vi.fn().mockResolvedValue(sampleCategory),
        findMany: vi.fn().mockResolvedValue([sampleCategory]),
        count: vi.fn().mockResolvedValue(1),
      },
      product: {
        count: vi.fn().mockResolvedValue(0),
      },
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

    adminToken = tokenService.signAccessToken({
      sub: adminUserId,
      email: 'admin@store.local',
      name: 'System Admin',
      roles: ['SUPER_ADMIN'],
      sessionId: testSessionId,
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /api/v1/categories should create category', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/categories',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Snacks & Confectionery',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.category.id).toBe(categoryId);
    expect(body.category.slug).toBe('snacks-confectionery');
  });

  it('GET /api/v1/categories should return paginated category list', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/categories',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.items).toHaveLength(1);
    expect(body.pagination.totalItems).toBe(1);
  });

  it('GET /api/v1/categories/:categoryId should return category details', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/categories/${categoryId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.category.id).toBe(categoryId);
  });

  it('PATCH /api/v1/categories/:categoryId/status should update category status', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/categories/${categoryId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'INACTIVE' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.category.status).toBe('INACTIVE');
  });

  it('DELETE /api/v1/categories/:categoryId should delete category', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/categories/${categoryId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
  });
});
