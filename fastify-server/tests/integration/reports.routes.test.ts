import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

describe('Reports Routes (Integration)', () => {
  let app: FastifyInstance;
  let mockPrisma: any;
  let adminToken: string;

  const adminUserId = '550e8400-e29b-41d4-a716-446655440000';
  const testSessionId = '660e8400-e29b-41d4-a716-446655440001';
  const storeId = '770e8400-e29b-41d4-a716-446655440002';
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
        findMany: vi.fn().mockResolvedValue([{ storeId }]),
      },
      store: {
        findFirst: vi.fn().mockResolvedValue(sampleStore),
      },
      sale: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'sale-1',
            status: 'COMPLETED',
            grandTotal: new Prisma.Decimal('150.00'),
            discountTotal: new Prisma.Decimal('0.00'),
            amountRefunded: new Prisma.Decimal('0.00'),
            createdAt: mockDate,
          },
        ]),
      },
      saleItem: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      payment: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      inventoryBalance: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      purchaseOrder: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      reportRequest: {
        create: vi.fn().mockResolvedValue({
          id: 'rep-req-uuid-1',
          reportNumber: 'REP-20261025-1001',
          reportType: 'SALES_SUMMARY',
          storeId,
          requestedByUserId: adminUserId,
          parameters: {},
          status: 'PENDING',
          createdAt: mockDate,
          completedAt: null,
          expiresAt: null,
          errorMessage: null,
          resultData: null,
        }),
        findFirst: vi.fn().mockResolvedValue({
          id: 'rep-req-uuid-1',
          reportNumber: 'REP-20261025-1001',
          reportType: 'SALES_SUMMARY',
          storeId,
          status: 'COMPLETED',
          createdAt: mockDate,
          completedAt: mockDate,
          resultData: { totalOrders: 1, grossSales: '150.00' },
        }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ nextval: 1001 }]),
    };

    app = await buildApp({
      prismaOverride: mockPrisma,
      disableRateLimit: true,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication & Authorization Guards', () => {
    it('returns 401 Unauthorized when no bearer token is supplied', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/sales-summary?storeId=${storeId}`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 400 Bad Request when storeId is missing or invalid UUID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/reports/sales-summary?storeId=not-a-uuid',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('Synchronous Report Endpoints', () => {
    it('GET /api/v1/reports/sales-summary retrieves sales totals and breakdown', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/sales-summary?storeId=${storeId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.storeId).toBe(storeId);
      expect(json.data.grossSales).toBe('150.00');
    });

    it('GET /api/v1/reports/top-products retrieves top products list', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/top-products?storeId=${storeId}&limit=5`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data.items)).toBe(true);
    });

    it('GET /api/v1/reports/payments retrieves payment settlement summary', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/payments?storeId=${storeId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.totalsByMethod).toBeDefined();
    });

    it('GET /api/v1/reports/inventory retrieves inventory balances and valuation', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/inventory?storeId=${storeId}&page=1&limit=20`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.totalInventoryValuation).toBeDefined();
    });

    it('GET /api/v1/reports/low-stock retrieves low-stock items', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/low-stock?storeId=${storeId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.lowStockCount).toBeDefined();
    });

    it('GET /api/v1/reports/procurement retrieves procurement and PO summary', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/reports/procurement?storeId=${storeId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.poCountsByStatus).toBeDefined();
    });
  });

  describe('Asynchronous Report Generation Workflow', () => {
    it('POST /api/v1/reports/async queues report generation and returns 202 Accepted ticket', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/reports/async',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'content-type': 'application/json',
        },
        payload: {
          storeId,
          reportType: 'SALES_SUMMARY',
          parameters: { groupBy: 'day' },
        },
      });

      expect(response.statusCode).toBe(202);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.reportRequestId).toBe('rep-req-uuid-1');
      expect(json.data.status).toBe('PENDING');
    });

    it('GET /api/v1/reports/async/:id retrieves report status and result payload', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/reports/async/rep-req-uuid-1',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.data.status).toBe('COMPLETED');
      expect(json.data.resultData).toBeDefined();
    });
  });
});
