import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

describe('Store Routes (Integration)', () => {
  let app: FastifyInstance;
  let mockPrisma: PrismaClient;
  let adminToken: string;

  const adminUserId = '550e8400-e29b-41d4-a716-446655440000';
  const testSessionId = '660e8400-e29b-41d4-a716-446655440001';
  const storeId = '770e8400-e29b-41d4-a716-446655440002';

  const sampleStore = {
    id: storeId,
    name: 'Midtown Branch',
    code: 'STORE-MID',
    description: 'Midtown location',
    email: 'midtown@store.local',
    phone: '+1-555-0199',
    addressLine1: '200 Park Ave',
    addressLine2: null,
    city: 'New York',
    state: 'NY',
    postalCode: '10166',
    countryCode: 'USA',
    timezone: 'America/New_York',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const sampleAdminUser = {
    id: adminUserId,
    email: 'admin@store.local',
    name: 'System Admin',
    status: 'ACTIVE',
    roles: [{ id: 'r1', userId: adminUserId, role: 'SUPER_ADMIN' }],
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
      store: {
        findFirst: vi.fn().mockImplementation(({ where }) => {
          if (where.id === storeId || where.code === 'STORE-MID') {
            return Promise.resolve(sampleStore);
          }
          return Promise.resolve(null);
        }),
        create: vi.fn().mockResolvedValue(sampleStore),
        findMany: vi.fn().mockResolvedValue([sampleStore]),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn().mockImplementation(({ data }) => {
          return Promise.resolve({ ...sampleStore, ...data });
        }),
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

  it('POST /api/v1/stores should create store for authorized administrator', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/stores',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'New Suburban Store',
        code: 'STORE-SUB',
        timezone: 'America/New_York',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.statusCode).toBe(201);
    expect(body.store.id).toBe(storeId);
  });

  it('GET /api/v1/stores should return paginated stores', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/stores',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.items).toHaveLength(1);
    expect(body.pagination.totalItems).toBe(1);
  });

  it('GET /api/v1/stores/:storeId should return store details', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/stores/${storeId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.store.code).toBe('STORE-MID');
  });

  it('PATCH /api/v1/stores/:storeId/status should update store status', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/stores/${storeId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'SUSPENDED' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.store.status).toBe('SUSPENDED');
  });
});
