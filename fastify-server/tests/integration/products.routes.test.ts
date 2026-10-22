import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

describe('Product & Variant Routes (Integration)', () => {
  let app: FastifyInstance;
  let mockPrisma: PrismaClient;
  let adminToken: string;

  const adminUserId = '550e8400-e29b-41d4-a716-446655440000';
  const testSessionId = '660e8400-e29b-41d4-a716-446655440001';
  const categoryId = '990e8400-e29b-41d4-a716-446655440004';
  const productId = 'aa0e8400-e29b-41d4-a716-446655440005';
  const variantId = 'bb0e8400-e29b-41d4-a716-446655440006';

  const sampleAdminUser = {
    id: adminUserId,
    email: 'admin@store.local',
    name: 'System Admin',
    status: 'ACTIVE',
    roles: [{ id: 'r1', userId: adminUserId, role: 'SUPER_ADMIN' }],
  };

  const sampleCategory = {
    id: categoryId,
    name: 'Beverages',
    slug: 'beverages',
    status: 'ACTIVE',
  };

  const sampleVariant = {
    id: variantId,
    productId,
    name: 'Standard Bottle',
    sku: 'BEV-001-STD',
    barcode: '1234567890123',
    price: new Prisma.Decimal('4.99'),
    costPrice: new Prisma.Decimal('2.50'),
    currency: 'USD',
    taxCategory: 'STANDARD',
    attributes: { volume: '500ml' },
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleProduct = {
    id: productId,
    name: 'Natural Spring Water',
    slug: 'natural-spring-water',
    description: 'Mineral water',
    categoryId,
    brand: 'PureSpring',
    status: 'ACTIVE',
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    category: sampleCategory,
    variants: [sampleVariant],
  };

  const sampleSession = {
    id: testSessionId,
    userId: adminUserId,
    status: 'ACTIVE',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  };

  beforeAll(async () => {
    mockPrisma = {
      $transaction: vi.fn().mockImplementation(async (callback: (tx: any) => Promise<any>) => {
        return callback(mockPrisma);
      }),
      $disconnect: vi.fn().mockResolvedValue(undefined),
      user: {
        findUnique: vi.fn().mockResolvedValue(sampleAdminUser),
      },
      session: {
        findUnique: vi.fn().mockResolvedValue(sampleSession),
      },
      productCategory: {
        findUnique: vi.fn().mockResolvedValue(sampleCategory),
      },
      product: {
        findFirst: vi.fn().mockImplementation(({ where }) => {
          if (where.id === productId || where.slug === 'natural-spring-water') {
            return Promise.resolve(sampleProduct);
          }
          return Promise.resolve(null);
        }),
        create: vi.fn().mockResolvedValue(sampleProduct),
        update: vi.fn().mockImplementation(({ data }) => {
          return Promise.resolve({ ...sampleProduct, ...data });
        }),
        findMany: vi.fn().mockResolvedValue([sampleProduct]),
        count: vi.fn().mockResolvedValue(1),
      },
      productVariant: {
        findUnique: vi.fn().mockImplementation(({ where }) => {
          if (where.id === variantId || where.sku === 'BEV-001-STD') {
            return Promise.resolve(sampleVariant);
          }
          return Promise.resolve(null);
        }),
        findMany: vi.fn().mockResolvedValue([sampleVariant]),
        create: vi.fn().mockResolvedValue(sampleVariant),
        update: vi.fn().mockImplementation(({ data }) => {
          return Promise.resolve({ ...sampleVariant, ...data });
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

  it('POST /api/v1/products should create product with initial variant', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/products',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Natural Spring Water',
        categoryId,
        initialVariant: {
          name: 'Standard Bottle',
          sku: 'BEV-001-STD',
          price: 4.99,
          barcode: '1234567890123',
        },
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.product.id).toBe(productId);
    expect(body.product.variants).toBeDefined();
    expect(body.product.variants[0].price).toBe('4.99');
  });

  it('GET /api/v1/products should return paginated products', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/products',
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.items).toHaveLength(1);
    expect(body.pagination.totalItems).toBe(1);
  });

  it('GET /api/v1/products/:productId should return single product with variants', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/products/${productId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.product.id).toBe(productId);
    expect(body.product.variants).toHaveLength(1);
  });

  it('POST /api/v1/products/:productId/variants should add variant to product', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/products/${productId}/variants`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Large 1L Bottle',
        sku: 'BEV-001-1L',
        price: 7.49,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.variant.id).toBe(variantId);
  });

  it('GET /api/v1/variants/:variantId should return variant details', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/variants/${variantId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.variant.sku).toBe('BEV-001-STD');
    expect(body.variant.price).toBe('4.99');
  });

  it('PATCH /api/v1/variants/:variantId should update price and variant metadata', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/variants/${variantId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        price: 5.49,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.variant.id).toBe(variantId);
  });
});
