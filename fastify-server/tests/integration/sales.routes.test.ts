import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

describe('Sales Routes (Integration)', () => {
  let app: FastifyInstance;
  let mockPrisma: any;
  let adminToken: string;

  const adminUserId = '550e8400-e29b-41d4-a716-446655440000';
  const testSessionId = '660e8400-e29b-41d4-a716-446655440001';
  const storeId = '770e8400-e29b-41d4-a716-446655440002';
  const variantId = '880e8400-e29b-41d4-a716-446655440003';
  const saleId = '990e8400-e29b-41d4-a716-446655440004';
  const mockDate = new Date();

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

  const sampleStore = {
    id: storeId,
    name: 'Downtown Flagship',
    code: 'FLAG-01',
    status: 'ACTIVE',
    deletedAt: null,
  };

  const sampleVariant = {
    id: variantId,
    name: 'Wireless Mouse',
    sku: 'MOUSE-01',
    price: new Prisma.Decimal('29.99'),
    currency: 'USD',
    status: 'ACTIVE',
    product: {
      id: 'prod-1',
      name: 'Peripherals',
      status: 'ACTIVE',
      deletedAt: null,
    },
  };

  const sampleSale = {
    id: saleId,
    saleNumber: 'SAL-20261024-1006',
    storeId,
    status: 'DRAFT',
    currencyCode: 'USD',
    subtotal: new Prisma.Decimal('29.99'),
    discountTotal: new Prisma.Decimal('0.00'),
    taxTotal: new Prisma.Decimal('0.00'),
    grandTotal: new Prisma.Decimal('29.99'),
    amountPaid: new Prisma.Decimal('0.00'),
    amountRefunded: new Prisma.Decimal('0.00'),
    cashierUserId: adminUserId,
    idempotencyKey: null,
    notes: 'POS Draft Sale',
    completedAt: null,
    cancelledAt: null,
    createdAt: mockDate,
    updatedAt: mockDate,
    items: [
      {
        id: 'item-1',
        saleId,
        variantId,
        skuSnapshot: 'MOUSE-01',
        productNameSnapshot: 'Peripherals',
        variantNameSnapshot: 'Wireless Mouse',
        quantity: new Prisma.Decimal('1.0000'),
        unitPrice: new Prisma.Decimal('29.99'),
        discountAmount: new Prisma.Decimal('0.00'),
        taxRate: new Prisma.Decimal('0.0000'),
        taxAmount: new Prisma.Decimal('0.00'),
        lineTotal: new Prisma.Decimal('29.99'),
        createdAt: mockDate,
      },
    ],
    payments: [],
    refunds: [],
    receipt: null,
    store: sampleStore,
    cashierUser: { id: adminUserId, name: 'System Admin', email: 'admin@store.local' },
  };

  beforeAll(async () => {
    loadEnv();
    adminToken = tokenService.generateAccessToken(
      {
        id: adminUserId,
        email: sampleAdminUser.email,
        roles: ['SUPER_ADMIN'],
        sessionId: testSessionId,
        tokenVersion: 1,
      },
      '1h'
    );

    mockPrisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue(sampleAdminUser),
      },
      session: {
        findUnique: vi.fn().mockResolvedValue(sampleSession),
        update: vi.fn().mockResolvedValue(sampleSession),
      },
      storeMembership: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'mem-1',
          userId: adminUserId,
          storeId,
          role: 'SUPER_ADMIN',
          status: 'ACTIVE',
          store: sampleStore,
        }),
      },
      store: {
        findFirst: vi.fn().mockResolvedValue(sampleStore),
      },
      productVariant: {
        findMany: vi.fn().mockResolvedValue([sampleVariant]),
      },
      sale: {
        create: vi.fn().mockResolvedValue(sampleSale),
        findUnique: vi.fn().mockResolvedValue(sampleSale),
        findMany: vi.fn().mockResolvedValue([sampleSale]),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn().mockResolvedValue(sampleSale),
      },
      payment: {
        create: vi.fn(),
        findMany: vi.fn().mockResolvedValue([]),
      },
      receipt: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'rec-1',
          receiptNumber: 'REC-20261024-1006',
          saleId,
          storeId,
          storeNameSnapshot: 'Downtown Flagship',
          cashierNameSnapshot: 'System Admin',
          receiptData: {},
          issuedAt: mockDate,
          createdAt: mockDate,
        }),
      },
      inventoryBalance: {
        update: vi.fn(),
      },
      inventoryMovement: {
        create: vi.fn(),
      },
      $queryRaw: vi.fn().mockImplementation((query: any) => {
        const sql = query?.strings?.join(' ') ?? '';
        if (sql.includes('SELECT id, store_id, variant_id, quantity_on_hand')) {
          return Promise.resolve([
            {
              id: 'bal-1',
              store_id: storeId,
              variant_id: variantId,
              quantity_on_hand: new Prisma.Decimal('10.0000'),
              quantity_reserved: new Prisma.Decimal('0.0000'),
              reorder_level: new Prisma.Decimal('2.0000'),
            },
          ]);
        }
        return Promise.resolve([{ nextval: '1006' }]);
      }),
      $transaction: vi.fn((callback: any) => callback(mockPrisma)),
    };

    app = await buildApp({
      disableRateLimit: true,
      prismaOverride: mockPrisma,
    });
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  it('POST /api/v1/sales - creates a new draft sale', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sales',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        storeId,
        currencyCode: 'USD',
        items: [{ variantId, quantity: '1' }],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(saleId);
    expect(body.data.grandTotal).toBe('29.99');
  });

  it('GET /api/v1/sales - lists sales', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/sales?storeId=${storeId}`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.pagination.total).toBe(1);
  });

  it('GET /api/v1/sales/:saleId - retrieves sale by id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/sales/${saleId}`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.saleNumber).toBe('SAL-20261024-1006');
  });

  it('POST /api/v1/sales/checkout - executes direct checkout with cash tender', async () => {
    mockPrisma.sale.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...sampleSale,
        status: 'COMPLETED',
        amountPaid: new Prisma.Decimal('29.99'),
        completedAt: mockDate,
      });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/sales/checkout',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        storeId,
        paymentMethod: 'CASH',
        amountTendered: '30.00',
        items: [{ variantId, quantity: '1' }],
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('COMPLETED');
    expect(body.data.changeDue).toBe('0.01');
  });

  it('POST /api/v1/sales/:saleId/cancel - cancels an in-progress sale', async () => {
    mockPrisma.sale.findUnique.mockResolvedValueOnce(sampleSale);
    mockPrisma.sale.update.mockResolvedValueOnce({
      ...sampleSale,
      status: 'CANCELLED',
      cancelledAt: mockDate,
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/${saleId}/cancel`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        reason: 'Customer cancelled transaction',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('CANCELLED');
  });
});
