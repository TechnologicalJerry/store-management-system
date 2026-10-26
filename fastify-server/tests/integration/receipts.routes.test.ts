import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

describe('Receipts Routes (Integration)', () => {
  let app: FastifyInstance;
  let mockPrisma: any;
  let adminToken: string;

  const adminUserId = '550e8400-e29b-41d4-a716-446655440000';
  const testSessionId = '660e8400-e29b-41d4-a716-446655440001';
  const storeId = '770e8400-e29b-41d4-a716-446655440002';
  const saleId = '880e8400-e29b-41d4-a716-446655440003';
  const receiptId = '990e8400-e29b-41d4-a716-446655440004';
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

  const sampleReceipt = {
    id: receiptId,
    receiptNumber: 'REC-20261024-1008',
    saleId,
    storeId,
    storeNameSnapshot: 'Uptown Store',
    storeAddressSnapshot: '789 Uptown Ave',
    cashierNameSnapshot: 'System Admin',
    receiptData: {
      saleNumber: 'SAL-20261024-1008',
      receiptNumber: 'REC-20261024-1008',
      issuedAt: mockDate.toISOString(),
    },
    issuedAt: mockDate,
    createdAt: mockDate,
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
      receipt: {
        findUnique: vi.fn().mockResolvedValue(sampleReceipt),
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

  it('GET /api/v1/receipts/:receiptId - retrieves receipt by receipt id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/receipts/${receiptId}`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(receiptId);
    expect(body.data.receiptNumber).toBe('REC-20261024-1008');
  });

  it('GET /api/v1/sales/:saleId/receipt - retrieves receipt by sale id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/sales/${saleId}/receipt`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.success).toBe(true);
    expect(body.data.receiptNumber).toBe('REC-20261024-1008');
  });
});
