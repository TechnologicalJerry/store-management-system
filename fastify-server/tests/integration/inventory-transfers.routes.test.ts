import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

describe('Inventory Transfer Routes (Integration)', () => {
  let app: FastifyInstance;
  let mockPrisma: any;
  let adminToken: string;

  const adminUserId = '550e8400-e29b-41d4-a716-446655440000';
  const testSessionId = '660e8400-e29b-41d4-a716-446655440001';
  const sourceStoreId = '770e8400-e29b-41d4-a716-446655440002';
  const destStoreId = '880e8400-e29b-41d4-a716-446655440003';
  const variantId = '990e8400-e29b-41d4-a716-446655440004';
  const transferId = 'aa0e8400-e29b-41d4-a716-446655440005';

  const mockDate = new Date();
  const sampleSourceStore = { id: sourceStoreId, name: 'Warehouse Hub', code: 'WH-01', status: 'ACTIVE', deletedAt: null };
  const sampleDestStore = { id: destStoreId, name: 'Downtown Branch', code: 'DT-01', status: 'ACTIVE', deletedAt: null };

  const sampleTransfer = {
    id: transferId,
    transferNumber: 'TRF-20261022-0001',
    sourceStoreId,
    destinationStoreId: destStoreId,
    status: 'DRAFT',
    notes: 'Inter-store transfer',
    sourceStore: sampleSourceStore,
    destinationStore: sampleDestStore,
    items: [
      {
        id: 'item-01',
        transferId,
        variantId,
        quantityRequested: new Prisma.Decimal('50.0000'),
        quantityShipped: new Prisma.Decimal('0.0000'),
        quantityReceived: new Prisma.Decimal('0.0000'),
        notes: null,
        variant: {
          id: variantId,
          productId: 'p-01',
          name: 'Variant 1',
          sku: 'SKU-01',
          barcode: '123',
        },
        createdAt: mockDate,
        updatedAt: mockDate,
      },
    ],
    createdByUserId: adminUserId,
    approvedByUserId: null,
    shippedByUserId: null,
    receivedByUserId: null,
    shippedAt: null,
    receivedAt: null,
    cancelledAt: null,
    createdAt: mockDate,
    updatedAt: mockDate,
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
      $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
      $queryRaw: vi.fn().mockResolvedValue([
        {
          id: 'bal-01',
          store_id: sourceStoreId,
          variant_id: variantId,
          quantity_on_hand: new Prisma.Decimal('100.0000'),
          quantity_reserved: new Prisma.Decimal('0.0000'),
          reorder_level: new Prisma.Decimal('10.0000'),
        },
      ]),
      user: {
        findUnique: vi.fn().mockResolvedValue(sampleAdminUser),
      },
      session: {
        findUnique: vi.fn().mockResolvedValue(sampleSession),
      },
      store: {
        findUnique: vi.fn().mockImplementation(({ where }: any) => {
          if (where.id === sourceStoreId) return Promise.resolve(sampleSourceStore);
          if (where.id === destStoreId) return Promise.resolve(sampleDestStore);
          return Promise.resolve(null);
        }),
      },
      storeMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'mem-01',
          userId: adminUserId,
          storeId: sourceStoreId,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          store: sampleSourceStore,
        }),
      },
      productVariant: {
        findMany: vi.fn().mockResolvedValue([{ id: variantId }]),
      },
      inventoryTransfer: {
        create: vi.fn().mockResolvedValue(sampleTransfer),
        findUnique: vi.fn().mockResolvedValue(sampleTransfer),
        findMany: vi.fn().mockResolvedValue([sampleTransfer]),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn().mockImplementation(({ data }: any) => {
          return Promise.resolve({
            ...sampleTransfer,
            status: data.status || sampleTransfer.status,
            shippedAt: data.shippedAt || sampleTransfer.shippedAt,
            receivedAt: data.receivedAt || sampleTransfer.receivedAt,
          });
        }),
      },
      inventoryTransferItem: {
        update: vi.fn().mockResolvedValue(sampleTransfer.items[0]),
      },
      inventoryBalance: {
        update: vi.fn().mockResolvedValue({}),
        upsert: vi.fn().mockResolvedValue({}),
      },
      inventoryMovement: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const env = loadEnv({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/test?schema=public',
      DIRECT_URL: 'postgresql://postgres:postgres@localhost:5432/test?schema=public',
      JWT_SECRET: 'test_jwt_secret_must_be_at_least_32_characters_long_for_security',
      REFRESH_TOKEN_SECRET: 'test_refresh_secret_at_least_32_characters_long_security',
      COOKIE_SECRET: 'test_cookie_secret_at_least_32_characters_long_for_hmac_signing',
    });

    app = await buildApp({
      env,
      prismaOverride: mockPrisma as unknown as PrismaClient,
      disableRateLimit: true,
    });

    const tokenResult = await tokenService.generateTokenPair(
      {
        sub: adminUserId,
        email: 'admin@store.local',
        name: 'System Admin',
        roles: ['SUPER_ADMIN'],
        sessionId: testSessionId,
      },
      env.JWT_SECRET,
      env.REFRESH_TOKEN_SECRET,
      env.JWT_EXPIRES_IN,
      env.REFRESH_TOKEN_EXPIRES_IN
    );

    adminToken = tokenResult.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/v1/inventory-transfers - should create a transfer in DRAFT status', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/inventory-transfers',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        sourceStoreId,
        destinationStoreId: destStoreId,
        notes: 'Restock shipment',
        items: [{ variantId, quantityRequested: 50 }],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.transfer).toBeDefined();
    expect(body.transfer.status).toBe('DRAFT');
  });

  it('GET /api/v1/inventory-transfers - should list transfers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/inventory-transfers',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items.length).toBe(1);
  });

  it('GET /api/v1/inventory-transfers/:transferId - should retrieve transfer by ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/inventory-transfers/${transferId}`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.transfer.id).toBe(transferId);
  });

  it('PATCH /api/v1/inventory-transfers/:transferId/submit - should submit transfer', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/inventory-transfers/${transferId}/submit`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.transfer.status).toBe('REQUESTED');
  });

  it('PATCH /api/v1/inventory-transfers/:transferId/approve - should approve transfer', async () => {
    mockPrisma.inventoryTransfer.findUnique.mockResolvedValueOnce({
      ...sampleTransfer,
      status: 'REQUESTED',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/inventory-transfers/${transferId}/approve`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.transfer.status).toBe('APPROVED');
  });

  it('PATCH /api/v1/inventory-transfers/:transferId/ship - should ship transfer', async () => {
    mockPrisma.inventoryTransfer.findUnique.mockResolvedValueOnce({
      ...sampleTransfer,
      status: 'APPROVED',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/inventory-transfers/${transferId}/ship`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.transfer.status).toBe('SHIPPED');
  });

  it('PATCH /api/v1/inventory-transfers/:transferId/receive - should receive transfer', async () => {
    mockPrisma.inventoryTransfer.findUnique.mockResolvedValueOnce({
      ...sampleTransfer,
      status: 'SHIPPED',
    });

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/inventory-transfers/${transferId}/receive`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.transfer.status).toBe('RECEIVED');
  });
});
