import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

describe('Payments Routes (Integration)', () => {
  let app: FastifyInstance;
  let mockPrisma: any;
  let adminToken: string;

  const adminUserId = '550e8400-e29b-41d4-a716-446655440000';
  const testSessionId = '660e8400-e29b-41d4-a716-446655440001';
  const saleId = '770e8400-e29b-41d4-a716-446655440002';
  const paymentId = '880e8400-e29b-41d4-a716-446655440003';
  const refundId = '990e8400-e29b-41d4-a716-446655440004';
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

  const sampleSale = {
    id: saleId,
    saleNumber: 'SAL-20261024-1007',
    storeId: 'store-1',
    status: 'PENDING_PAYMENT',
    currencyCode: 'USD',
    grandTotal: new Prisma.Decimal('50.00'),
    amountPaid: new Prisma.Decimal('0.00'),
    amountRefunded: new Prisma.Decimal('0.00'),
    items: [],
    payments: [],
    refunds: [],
    receipt: null,
  };

  const samplePayment = {
    id: paymentId,
    saleId,
    paymentReference: 'PAY-20261024-1007',
    paymentMethod: 'CARD',
    status: 'CAPTURED',
    amount: new Prisma.Decimal('50.00'),
    currencyCode: 'USD',
    provider: 'MOCK_DIGITAL',
    providerTransactionId: 'mock_tx_7777',
    idempotencyKey: null,
    failureCode: null,
    failureMessage: null,
    initiatedAt: mockDate,
    authorizedAt: null,
    capturedAt: mockDate,
    failedAt: null,
    createdAt: mockDate,
    updatedAt: mockDate,
    refunds: [],
    sale: sampleSale,
  };

  const sampleRefund = {
    id: refundId,
    paymentId,
    saleId,
    refundReference: 'REF-20261024-1007',
    amount: new Prisma.Decimal('20.00'),
    currencyCode: 'USD',
    status: 'SUCCEEDED',
    reason: 'Defective item',
    providerRefundId: 'mock_ref_7777',
    idempotencyKey: null,
    requestedByUserId: adminUserId,
    processedAt: mockDate,
    createdAt: mockDate,
    updatedAt: mockDate,
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
      sale: {
        findUnique: vi.fn().mockResolvedValue(sampleSale),
        update: vi.fn().mockResolvedValue(sampleSale),
      },
      payment: {
        create: vi.fn().mockResolvedValue(samplePayment),
        findUnique: vi.fn().mockResolvedValue(samplePayment),
        findMany: vi.fn().mockResolvedValue([samplePayment]),
        update: vi.fn().mockResolvedValue(samplePayment),
      },
      refund: {
        create: vi.fn().mockResolvedValue(sampleRefund),
        findUnique: vi.fn().mockResolvedValue(sampleRefund),
        findMany: vi.fn().mockResolvedValue([sampleRefund]),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal('0.00') } }),
      },
      receipt: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ nextval: '1007' }]),
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

  it('POST /api/v1/sales/:saleId/payments - records a payment for a sale', async () => {
    mockPrisma.payment.findUnique.mockResolvedValueOnce(null); // idempotency check
    mockPrisma.sale.findUnique.mockResolvedValueOnce(sampleSale);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/sales/${saleId}/payments`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        paymentMethod: 'CARD',
        amount: '50.00',
        provider: 'MOCK_DIGITAL',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(paymentId);
    expect(body.data.status).toBe('CAPTURED');
  });

  it('GET /api/v1/sales/:saleId/payments - lists payments for a sale', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/sales/${saleId}/payments`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(paymentId);
  });

  it('GET /api/v1/payments/:paymentId - retrieves payment by id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/payments/${paymentId}`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.paymentReference).toBe('PAY-20261024-1007');
  });

  it('POST /api/v1/payments/:paymentId/void - voids an uncaptured payment', async () => {
    const authorizedPayment = {
      ...samplePayment,
      status: 'AUTHORIZED',
      capturedAt: null,
    };
    mockPrisma.payment.findUnique.mockResolvedValueOnce(authorizedPayment);
    mockPrisma.payment.update.mockResolvedValueOnce({
      ...authorizedPayment,
      status: 'CANCELLED',
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentId}/void`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        reason: 'Customer cancelled card checkout',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('CANCELLED');
  });

  it('POST /api/v1/payments/:paymentId/refunds - issues a refund against captured payment', async () => {
    mockPrisma.refund.findUnique.mockResolvedValueOnce(null); // idempotency check
    mockPrisma.payment.findUnique.mockResolvedValueOnce(samplePayment);
    mockPrisma.sale.findUnique.mockResolvedValueOnce(sampleSale);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/payments/${paymentId}/refunds`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        amount: '20.00',
        reason: 'Defective item',
      },
    });

    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(refundId);
    expect(body.data.status).toBe('SUCCEEDED');
  });

  it('GET /api/v1/payments/:paymentId/refunds - lists refunds for payment', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/payments/${paymentId}/refunds`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].refundReference).toBe('REF-20261024-1007');
  });
});
