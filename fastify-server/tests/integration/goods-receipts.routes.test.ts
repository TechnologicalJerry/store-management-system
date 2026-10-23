import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

describe('Goods Receipts Routes (Integration)', () => {
  let app: FastifyInstance;
  let mockPrisma: any;
  let adminToken: string;

  const adminUserId = '550e8400-e29b-41d4-a716-446655440000';
  const testSessionId = '660e8400-e29b-41d4-a716-446655440001';
  const storeId = '770e8400-e29b-41d4-a716-446655440002';
  const variantId = '880e8400-e29b-41d4-a716-446655440003';
  const poId = '990e8400-e29b-41d4-a716-446655440004';
  const poItemId = 'aa0e8400-e29b-41d4-a716-446655440005';
  const receiptId = 'bb0e8400-e29b-41d4-a716-446655440006';
  const balanceId = 'cc0e8400-e29b-41d4-a716-446655440007';
  const mockDate = new Date();

  const samplePo = {
    id: poId,
    purchaseOrderNumber: 'PO-20261023-1001',
    destinationStoreId: storeId,
    status: 'ORDERED' as const,
    items: [
      {
        id: poItemId,
        purchaseOrderId: poId,
        variantId,
        skuSnapshot: 'GEAR-SET-01',
        productNameSnapshot: 'Transmission Gear Set',
        quantityOrdered: new Prisma.Decimal('50.0000'),
        quantityReceived: new Prisma.Decimal('0.0000'),
        unitPrice: new Prisma.Decimal('120.00'),
      },
    ],
  };

  const sampleReceipt = {
    id: receiptId,
    receiptNumber: 'GR-20261023-1001',
    purchaseOrderId: poId,
    destinationStoreId: storeId,
    status: 'COMPLETED' as const,
    receivedByUserId: adminUserId,
    receivedAt: mockDate,
    deliveryReference: 'TRUCK-9988',
    notes: 'Freight shipment accepted',
    idempotencyKey: null,
    createdAt: mockDate,
    updatedAt: mockDate,
    items: [
      {
        id: 'gr-item-1',
        goodsReceiptId: receiptId,
        purchaseOrderItemId: poItemId,
        variantId,
        quantityDelivered: new Prisma.Decimal('50.0000'),
        quantityAccepted: new Prisma.Decimal('50.0000'),
        quantityRejected: new Prisma.Decimal('0.0000'),
        rejectionReason: null,
        createdAt: mockDate,
      },
    ],
    purchaseOrder: {
      id: poId,
      purchaseOrderNumber: 'PO-20261023-1001',
      status: 'RECEIVED',
    },
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
      purchaseOrder: {
        findUnique: vi.fn().mockResolvedValue(samplePo),
        update: vi.fn().mockResolvedValue(samplePo),
      },
      purchaseOrderItem: {
        update: vi.fn().mockResolvedValue({}),
        findMany: vi.fn().mockResolvedValue([
          {
            ...samplePo.items[0],
            quantityReceived: new Prisma.Decimal('50.0000'),
          },
        ]),
      },
      goodsReceipt: {
        create: vi.fn().mockResolvedValue(sampleReceipt),
        findUnique: vi.fn().mockResolvedValue(sampleReceipt),
        findMany: vi.fn().mockResolvedValue([sampleReceipt]),
        count: vi.fn().mockResolvedValue(1),
      },
      inventoryBalance: {
        upsert: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      inventoryMovement: {
        create: vi.fn().mockResolvedValue({}),
      },
      purchaseOrderStatusHistory: {
        create: vi.fn().mockResolvedValue({}),
      },
      $queryRaw: vi.fn().mockImplementation((query: any) => {
        const text = query.strings ? query.strings.join(' ') : String(query);
        if (text.includes('goods_receipt_num_seq')) {
          return Promise.resolve([{ nextval: 1001 }]);
        }
        if (text.includes('FROM purchase_orders') && text.includes('FOR UPDATE')) {
          return Promise.resolve([
            {
              id: poId,
              purchase_order_number: 'PO-20261023-1001',
              destination_store_id: storeId,
              status: 'ORDERED',
            },
          ]);
        }
        if (text.includes('FROM inventory_balances') && text.includes('FOR UPDATE')) {
          return Promise.resolve([
            {
              id: balanceId,
              store_id: storeId,
              variant_id: variantId,
              quantity_on_hand: new Prisma.Decimal('10.0000'),
              quantity_reserved: new Prisma.Decimal('0.0000'),
              reorder_level: new Prisma.Decimal('5.0000'),
            },
          ]);
        }
        return Promise.resolve([]);
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

  describe('POST /api/v1/purchase-orders/:purchaseOrderId/receipts', () => {
    it('creates goods receipt and updates inventory with 201 Created', async () => {
      mockPrisma.goodsReceipt.findUnique.mockResolvedValueOnce(null); // idempotency check

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/purchase-orders/${poId}/receipts`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          deliveryReference: 'TRUCK-9988',
          notes: 'Freight shipment accepted',
          items: [
            {
              purchaseOrderItemId: poItemId,
              quantityDelivered: '50.0000',
              quantityAccepted: '50.0000',
              quantityRejected: '0.0000',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.receiptNumber).toBe('GR-20261023-1001');
      expect(json.data.items).toHaveLength(1);
    });

    it('rejects receiving if delivered != accepted + rejected with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/purchase-orders/${poId}/receipts`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          items: [
            {
              purchaseOrderItemId: poItemId,
              quantityDelivered: '50.0000',
              quantityAccepted: '40.0000',
              quantityRejected: '5.0000', // 40 + 5 != 50
            },
          ],
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/purchase-orders/:purchaseOrderId/receipts', () => {
    it('lists all goods receipts for the purchase order', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/purchase-orders/${poId}/receipts`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.data).toHaveLength(1);
    });
  });

  describe('GET /api/v1/goods-receipts/:goodsReceiptId', () => {
    it('returns single goods receipt details', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/goods-receipts/${receiptId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.data.id).toBe(receiptId);
    });
  });
});
