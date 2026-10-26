import { vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { tokenService } from '../../src/modules/auth/token.service.js';
import { TEST_IDS, createMockUser } from './test-fixtures.js';

export function buildMockPrisma(): Record<string, any> {
  return {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
    },
    userRole: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    session: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    store: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
    },
    storeMembership: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
    },
    productCategory: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    product: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    productVariant: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    inventoryBalance: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    inventoryMovement: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    stockReservation: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    inventoryTransfer: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
    },
    supplier: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    supplierProduct: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
    },
    purchaseOrder: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    purchaseOrderItem: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
    },
    goodsReceipt: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
    },
    sale: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    saleItem: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
    },
    payment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
    },
    refund: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
    },
    receipt: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    reportRequest: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    outboxEvent: {
      create: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn().mockImplementation(async (cb: (tx: any) => Promise<any>) => cb(buildMockPrisma())),
    $queryRaw: vi.fn().mockResolvedValue([{ nextval: 1001 }]),
  };
}

export interface TestAppOptions {
  mockPrisma?: Record<string, any>;
  disableRateLimit?: boolean;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<{
  app: FastifyInstance;
  prisma: Record<string, any>;
}> {
  loadEnv();
  const prisma = options.mockPrisma ?? buildMockPrisma();

  const app = await buildApp({
    prismaOverride: prisma as any,
    disableRateLimit: options.disableRateLimit ?? true,
  });

  await app.ready();
  return { app, prisma };
}

export function generateTestAuthHeader(
  user = createMockUser(),
  role: 'SUPER_ADMIN' | 'ADMIN' | 'STORE_MANAGER' | 'INVENTORY_MANAGER' | 'CASHIER' = 'CASHIER'
): { authorization: string } {
  loadEnv();
  const token = tokenService.generateAccessToken(
    {
      id: user.id,
      email: user.email,
      roles: [role],
      sessionId: TEST_IDS.SESSION_1,
      tokenVersion: 1,
    },
    '1h'
  );
  return { authorization: `Bearer ${token}` };
}
