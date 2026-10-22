import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

describe('Inventory Routes (Integration)', () => {
  let app: FastifyInstance;
  let mockPrisma: any;
  let adminToken: string;

  const adminUserId = '550e8400-e29b-41d4-a716-446655440000';
  const testSessionId = '660e8400-e29b-41d4-a716-446655440001';
  const storeId = '770e8400-e29b-41d4-a716-446655440002';
  const variantId = '880e8400-e29b-41d4-a716-446655440003';

  const mockDate = new Date();
  const sampleStore = {
    id: storeId,
    name: 'Downtown Flagship',
    code: 'DT-01',
    status: 'ACTIVE',
    deletedAt: null,
  };

  const sampleVariant = {
    id: variantId,
    productId: 'prod-01',
    name: 'Espresso Blend',
    sku: 'COF-ESP-01',
    barcode: '987654321098',
    price: new Prisma.Decimal('14.99'),
    status: 'ACTIVE',
    product: { id: 'prod-01', name: 'Espresso', slug: 'espresso' },
  };

  const sampleBalance = {
    id: 'bal-01',
    storeId,
    variantId,
    quantityOnHand: new Prisma.Decimal('100.0000'),
    quantityReserved: new Prisma.Decimal('10.0000'),
    reorderLevel: new Prisma.Decimal('20.0000'),
    store: sampleStore,
    variant: sampleVariant,
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
          id: sampleBalance.id,
          store_id: storeId,
          variant_id: variantId,
          quantity_on_hand: sampleBalance.quantityOnHand,
          quantity_reserved: sampleBalance.quantityReserved,
          reorder_level: sampleBalance.reorderLevel,
        },
      ]),
      user: {
        findUnique: vi.fn().mockResolvedValue(sampleAdminUser),
      },
      session: {
        findUnique: vi.fn().mockResolvedValue(sampleSession),
      },
      store: {
        findUnique: vi.fn().mockResolvedValue(sampleStore),
      },
      storeMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'mem-01',
          userId: adminUserId,
          storeId,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          store: sampleStore,
        }),
      },
      productVariant: {
        findUnique: vi.fn().mockResolvedValue(sampleVariant),
      },
      inventoryBalance: {
        findUnique: vi.fn().mockResolvedValue(sampleBalance),
        findMany: vi.fn().mockResolvedValue([sampleBalance]),
        count: vi.fn().mockResolvedValue(1),
        upsert: vi.fn().mockResolvedValue(sampleBalance),
        update: vi.fn().mockResolvedValue(sampleBalance),
      },
      inventoryMovement: {
        create: vi.fn().mockResolvedValue({
          id: 'mov-01',
          storeId,
          variantId,
          movementType: 'STOCK_RECEIVED',
          quantityDelta: new Prisma.Decimal('50.0000'),
          quantityBefore: new Prisma.Decimal('100.0000'),
          quantityAfter: new Prisma.Decimal('150.0000'),
          referenceType: 'STOCK_RECEIPT',
          referenceId: null,
          idempotencyKey: null,
          reason: 'Initial load',
          notes: null,
          performedByUserId: adminUserId,
          performedByUser: { id: adminUserId, name: 'System Admin', email: 'admin@store.local' },
          createdAt: mockDate,
        }),
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      stockReservation: {
        create: vi.fn().mockResolvedValue({
          id: 'res-01',
          storeId,
          variantId,
          quantity: new Prisma.Decimal('5.0000'),
          status: 'ACTIVE',
          referenceType: 'ORDER',
          referenceId: 'ORD-01',
          expiresAt: null,
          createdByUserId: adminUserId,
          createdAt: mockDate,
          updatedAt: mockDate,
        }),
        findUnique: vi.fn(),
        update: vi.fn(),
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

  it('GET /api/v1/stores/:storeId/inventory - should list inventory balances', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/stores/${storeId}/inventory`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items.length).toBe(1);
    expect(body.items[0].quantityOnHand).toBe('100.0000');
    expect(body.items[0].quantityAvailable).toBe('90.0000');
  });

  it('GET /api/v1/stores/:storeId/inventory/:variantId - should retrieve single variant balance', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/stores/${storeId}/inventory/${variantId}`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.balance.variantId).toBe(variantId);
  });

  it('POST /api/v1/stores/:storeId/inventory/receipts - should receive stock', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/stores/${storeId}/inventory/receipts`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        variantId,
        quantity: 50,
        reason: 'Restock shipment',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.statusCode).toBe(201);
    expect(body.balance).toBeDefined();
    expect(body.movement).toBeDefined();
  });

  it('POST /api/v1/stores/:storeId/inventory/adjustments - should adjust stock', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/stores/${storeId}/inventory/adjustments`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        variantId,
        adjustmentType: 'INCREASE',
        quantity: 10,
        reason: 'Stock count correction',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.statusCode).toBe(200);
    expect(body.balance).toBeDefined();
  });

  it('POST /api/v1/stores/:storeId/inventory/reservations - should create stock reservation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/stores/${storeId}/inventory/reservations`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        variantId,
        quantity: 5,
        referenceType: 'ORDER',
        referenceId: 'ORD-01',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.reservation).toBeDefined();
    expect(body.reservation.status).toBe('ACTIVE');
  });

  it('should reject unauthenticated requests with 401', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/stores/${storeId}/inventory`,
    });

    expect(response.statusCode).toBe(401);
  });
});
