import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

describe('Purchase Orders Routes (Integration)', () => {
  let app: FastifyInstance;
  let mockPrisma: any;
  let adminToken: string;

  const adminUserId = '550e8400-e29b-41d4-a716-446655440000';
  const managerUserId = '550e8400-e29b-41d4-a716-446655440099';
  const testSessionId = '660e8400-e29b-41d4-a716-446655440001';
  const supplierId = '770e8400-e29b-41d4-a716-446655440002';
  const storeId = '880e8400-e29b-41d4-a716-446655440003';
  const variantId = '990e8400-e29b-41d4-a716-446655440004';
  const poId = 'aa0e8400-e29b-41d4-a716-446655440005';
  const mockDate = new Date();

  const sampleSupplier = {
    id: supplierId,
    name: 'Apex Industrial Supply',
    code: 'APEX-01',
    status: 'ACTIVE',
    deletedAt: null,
  };

  const sampleStore = {
    id: storeId,
    name: 'North Warehouse',
    code: 'NW-01',
    status: 'ACTIVE',
    deletedAt: null,
  };

  const sampleVariant = {
    id: variantId,
    name: 'Hydraulic Cylinder 50mm',
    sku: 'CYL-50MM',
    costPrice: new Prisma.Decimal('150.00'),
    status: 'ACTIVE',
    product: { id: 'prod-1', name: 'Cylinders', slug: 'cylinders' },
  };

  const samplePo = {
    id: poId,
    purchaseOrderNumber: 'PO-20261023-1001',
    supplierId,
    destinationStoreId: storeId,
    status: 'DRAFT' as const,
    currencyCode: 'USD',
    subtotal: new Prisma.Decimal('1500.00'),
    discountTotal: new Prisma.Decimal('0.00'),
    taxTotal: new Prisma.Decimal('75.00'),
    shippingTotal: new Prisma.Decimal('50.00'),
    grandTotal: new Prisma.Decimal('1625.00'),
    notes: 'Initial hydraulic parts order',
    createdByUserId: adminUserId,
    approvedByUserId: null,
    approvedAt: null,
    orderedAt: null,
    expectedDeliveryAt: null,
    cancelledAt: null,
    createdAt: mockDate,
    updatedAt: mockDate,
    supplier: sampleSupplier,
    destinationStore: sampleStore,
    items: [
      {
        id: 'po-item-1',
        purchaseOrderId: poId,
        variantId,
        supplierProductId: null,
        skuSnapshot: 'CYL-50MM',
        productNameSnapshot: 'Hydraulic Cylinder 50mm',
        supplierSkuSnapshot: null,
        quantityOrdered: new Prisma.Decimal('10.0000'),
        quantityReceived: new Prisma.Decimal('0.0000'),
        unitPrice: new Prisma.Decimal('150.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        taxRate: new Prisma.Decimal('0.0500'),
        lineTotal: new Prisma.Decimal('1575.00'),
        createdAt: mockDate,
        updatedAt: mockDate,
        variant: sampleVariant,
      },
    ],
    statusHistory: [],
    _count: { goodsReceipts: 0 },
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
      supplier: {
        findFirst: vi.fn().mockResolvedValue(sampleSupplier),
      },
      store: {
        findFirst: vi.fn().mockResolvedValue(sampleStore),
      },
      productVariant: {
        findUnique: vi.fn().mockResolvedValue(sampleVariant),
      },
      supplierProduct: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      purchaseOrder: {
        create: vi.fn().mockResolvedValue(samplePo),
        findUnique: vi.fn().mockResolvedValue(samplePo),
        findMany: vi.fn().mockResolvedValue([samplePo]),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn().mockResolvedValue(samplePo),
      },
      purchaseOrderItem: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      purchaseOrderStatusHistory: {
        create: vi.fn().mockResolvedValue({}),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ nextval: 1001 }]),
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

  describe('POST /api/v1/purchase-orders', () => {
    it('creates a new purchase order with line items in DRAFT status', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/purchase-orders',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          supplierId,
          destinationStoreId: storeId,
          shippingTotal: '50.00',
          items: [
            {
              variantId,
              quantityOrdered: '10.0000',
              unitPrice: '150.00',
              taxRate: '0.0500',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('DRAFT');
    });
  });

  describe('GET /api/v1/purchase-orders', () => {
    it('lists purchase orders with pagination', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/purchase-orders?page=1&pageSize=10',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
    });
  });

  describe('GET /api/v1/purchase-orders/:purchaseOrderId', () => {
    it('returns purchase order details with lines and calculations', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/purchase-orders/${poId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.data.id).toBe(poId);
      expect(json.data.items).toHaveLength(1);
    });
  });

  describe('POST /api/v1/purchase-orders/:purchaseOrderId/submit', () => {
    it('submits DRAFT purchase order for approval', async () => {
      mockPrisma.purchaseOrder.update.mockResolvedValueOnce({
        ...samplePo,
        status: 'PENDING_APPROVAL',
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/purchase-orders/${poId}/submit`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.data.status).toBe('PENDING_APPROVAL');
    });
  });

  describe('POST /api/v1/purchase-orders/:purchaseOrderId/approve', () => {
    it('approves purchase order', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValueOnce({
        ...samplePo,
        status: 'PENDING_APPROVAL',
      });
      mockPrisma.purchaseOrder.update.mockResolvedValueOnce({
        ...samplePo,
        status: 'APPROVED',
        approvedByUserId: adminUserId,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/purchase-orders/${poId}/approve`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { notes: 'Approved' },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.data.status).toBe('APPROVED');
    });
  });

  describe('POST /api/v1/purchase-orders/:purchaseOrderId/order', () => {
    it('marks approved purchase order as ordered', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValueOnce({
        ...samplePo,
        status: 'APPROVED',
      });
      mockPrisma.purchaseOrder.update.mockResolvedValueOnce({
        ...samplePo,
        status: 'ORDERED',
        orderedAt: mockDate,
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/purchase-orders/${poId}/order`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.data.status).toBe('ORDERED');
    });
  });

  describe('POST /api/v1/purchase-orders/:purchaseOrderId/cancel', () => {
    it('cancels purchase order with reason', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValueOnce(samplePo);
      mockPrisma.purchaseOrder.update.mockResolvedValueOnce({
        ...samplePo,
        status: 'CANCELLED',
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/purchase-orders/${poId}/cancel`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { reason: 'Supplier unable to meet delivery deadline' },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.data.status).toBe('CANCELLED');
    });
  });
});
