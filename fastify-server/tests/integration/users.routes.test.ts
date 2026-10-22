import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

describe('User Admin & Store Membership Routes (Integration)', () => {
  let app: FastifyInstance;
  let mockPrisma: PrismaClient;
  let adminToken: string;

  const adminUserId = '550e8400-e29b-41d4-a716-446655440000';
  const targetUserId = '550e8400-e29b-41d4-a716-446655440010';
  const testSessionId = '660e8400-e29b-41d4-a716-446655440001';
  const storeId = '770e8400-e29b-41d4-a716-446655440002';
  const membershipId = '880e8400-e29b-41d4-a716-446655440003';

  const sampleAdminUser = {
    id: adminUserId,
    email: 'admin@store.local',
    name: 'System Admin',
    status: 'ACTIVE',
    emailVerifiedAt: new Date(),
    lastLoginAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    roles: [{ id: 'r1', userId: adminUserId, role: 'SUPER_ADMIN' }],
  };

  const sampleTargetUser = {
    id: targetUserId,
    email: 'staff@store.local',
    name: 'Store Associate',
    status: 'ACTIVE',
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    roles: [{ id: 'r2', userId: targetUserId, role: 'CASHIER' }],
  };

  const sampleStore = {
    id: storeId,
    name: 'Downtown Store',
    code: 'STORE-001',
    status: 'ACTIVE',
    deletedAt: null,
  };

  const sampleMembership = {
    id: membershipId,
    userId: targetUserId,
    storeId,
    role: 'CASHIER',
    status: 'ACTIVE',
    createdByUserId: adminUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: sampleTargetUser,
    store: sampleStore,
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
        findUnique: vi.fn().mockImplementation(({ where }) => {
          if (where.id === adminUserId) return Promise.resolve(sampleAdminUser);
          if (where.id === targetUserId) return Promise.resolve(sampleTargetUser);
          return Promise.resolve(null);
        }),
        findMany: vi.fn().mockResolvedValue([sampleAdminUser, sampleTargetUser]),
        count: vi.fn().mockResolvedValue(2),
        update: vi.fn().mockImplementation(({ data }) => {
          return Promise.resolve({ ...sampleTargetUser, ...data });
        }),
      },
      session: {
        findUnique: vi.fn().mockResolvedValue(sampleSession),
      },
      store: {
        findFirst: vi.fn().mockResolvedValue(sampleStore),
      },
      storeMembership: {
        findUnique: vi.fn().mockImplementation(({ where }) => {
          if (where.id === membershipId) return Promise.resolve(sampleMembership);
          return Promise.resolve(null);
        }),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([sampleMembership]),
        count: vi.fn().mockResolvedValue(1),
        create: vi.fn().mockResolvedValue(sampleMembership),
        update: vi.fn().mockImplementation(({ data }) => {
          return Promise.resolve({ ...sampleMembership, ...data });
        }),
        delete: vi.fn().mockResolvedValue(sampleMembership),
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

  it('GET /api/v1/users should return paginated list of users', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.items).toHaveLength(2);
    expect(body.pagination.totalItems).toBe(2);
  });

  it('GET /api/v1/users/:userId should return single user details without secrets', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/users/${targetUserId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.user.id).toBe(targetUserId);
    expect(body.user.passwordHash).toBeUndefined();
  });

  it('PATCH /api/v1/users/:userId/status should update user status', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${targetUserId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'SUSPENDED' },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.user.status).toBe('SUSPENDED');
  });

  it('POST /api/v1/stores/:storeId/members should assign user to store', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/stores/${storeId}/members`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        userId: targetUserId,
        role: 'CASHIER',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.member.role).toBe('CASHIER');
    expect(body.member.userId).toBe(targetUserId);
  });

  it('GET /api/v1/stores/:storeId/members should list members for store', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/stores/${storeId}/members`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe(membershipId);
  });

  it('DELETE /api/v1/stores/:storeId/members/:membershipId should remove membership', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: `/api/v1/stores/${storeId}/members/${membershipId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
  });
});
