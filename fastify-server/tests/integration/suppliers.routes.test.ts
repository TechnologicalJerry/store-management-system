import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

describe('Suppliers Routes (Integration)', () => {
  let app: FastifyInstance;
  let mockPrisma: any;
  let adminToken: string;

  const adminUserId = '550e8400-e29b-41d4-a716-446655440000';
  const testSessionId = '660e8400-e29b-41d4-a716-446655440001';
  const supplierId = '770e8400-e29b-41d4-a716-446655440002';
  const variantId = '880e8400-e29b-41d4-a716-446655440003';
  const supplierProductId = '990e8400-e29b-41d4-a716-446655440004';
  const mockDate = new Date();

  const sampleSupplier = {
    id: supplierId,
    name: 'Precision Components Corp',
    code: 'PREC-01',
    email: 'contact@precision.com',
    phone: '+1-555-8822',
    website: 'https://precision.com',
    taxIdentifier: 'TAX-112233',
    addressLine1: '400 Industrial Parkway',
    addressLine2: null,
    city: 'Cleveland',
    state: 'OH',
    postalCode: '44101',
    countryCode: 'US',
    status: 'ACTIVE' as const,
    notes: 'Tier 1 component supplier',
    createdAt: mockDate,
    updatedAt: mockDate,
    deletedAt: null,
    _count: { products: 1 },
  };

  const sampleSupplierProduct = {
    id: supplierProductId,
    supplierId,
    variantId,
    supplierSku: 'PREC-SKU-100',
    supplierProductName: 'Alloy Bearing 20mm',
    purchasePrice: new Prisma.Decimal('24.50'),
    currencyCode: 'USD',
    minimumOrderQuantity: new Prisma.Decimal('5.0000'),
    leadTimeDays: 3,
    isPreferred: true,
    status: 'ACTIVE' as const,
    createdAt: mockDate,
    updatedAt: mockDate,
    variant: {
      id: variantId,
      name: 'Alloy Bearing 20mm',
      sku: 'BRG-20MM',
      barcode: '998877665544',
      status: 'ACTIVE',
      product: {
        id: 'prod-1',
        name: 'Bearings',
        slug: 'bearings',
        status: 'ACTIVE',
      },
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
      supplier: {
        create: vi.fn().mockResolvedValue(sampleSupplier),
        findFirst: vi.fn().mockResolvedValue(sampleSupplier),
        findMany: vi.fn().mockResolvedValue([sampleSupplier]),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn().mockResolvedValue(sampleSupplier),
      },
      supplierProduct: {
        create: vi.fn().mockResolvedValue(sampleSupplierProduct),
        findUnique: vi.fn().mockResolvedValue(sampleSupplierProduct),
        findMany: vi.fn().mockResolvedValue([sampleSupplierProduct]),
        count: vi.fn().mockResolvedValue(1),
        update: vi.fn().mockResolvedValue(sampleSupplierProduct),
        delete: vi.fn().mockResolvedValue(sampleSupplierProduct),
      },
      productVariant: {
        findUnique: vi.fn().mockResolvedValue({
          id: variantId,
          name: 'Alloy Bearing 20mm',
          sku: 'BRG-20MM',
          status: 'ACTIVE',
        }),
      },
      purchaseOrder: {
        count: vi.fn().mockResolvedValue(0),
      },
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

  describe('POST /api/v1/suppliers', () => {
    it('creates a new supplier with 201 Created', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValueOnce(null); // uniqueness check
      mockPrisma.supplier.create.mockResolvedValueOnce(sampleSupplier);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/suppliers',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'Precision Components Corp',
          code: 'PREC-01',
          email: 'contact@precision.com',
          countryCode: 'US',
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data.code).toBe('PREC-01');
    });

    it('rejects invalid email or malformed code with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/suppliers',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'Invalid Corp',
          code: 'INVALID CODE WITH SPACES!',
          email: 'not-an-email',
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/v1/suppliers', () => {
    it('lists suppliers with pagination and metadata', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/suppliers?page=1&pageSize=10',
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);
      expect(json.meta.page).toBe(1);
    });
  });

  describe('GET /api/v1/suppliers/:supplierId', () => {
    it('returns supplier details with 200 OK', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/suppliers/${supplierId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.data.id).toBe(supplierId);
    });
  });

  describe('POST /api/v1/suppliers/:supplierId/products', () => {
    it('registers product variant offering for supplier', async () => {
      mockPrisma.supplierProduct.findUnique.mockResolvedValueOnce(null); // no existing link
      mockPrisma.supplierProduct.create.mockResolvedValueOnce(sampleSupplierProduct);

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/suppliers/${supplierId}/products`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          variantId,
          supplierSku: 'PREC-SKU-100',
          purchasePrice: '24.50',
          minimumOrderQuantity: '5.0000',
          leadTimeDays: 3,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.payload);
      expect(json.data.purchasePrice).toBe('24.50');
    });
  });

  describe('GET /api/v1/suppliers/:supplierId/products', () => {
    it('lists products supplied by supplier', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/suppliers/${supplierId}/products`,
        headers: { authorization: `Bearer ${adminToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.data).toHaveLength(1);
    });
  });
});
