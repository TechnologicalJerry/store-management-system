import { Prisma } from '@prisma/client';

export const TEST_IDS = {
  SUPER_ADMIN: '11111111-1111-4111-a111-111111111111',
  ADMIN: '22222222-2222-4222-a222-222222222222',
  STORE_MANAGER: '33333333-3333-4333-a333-333333333333',
  CASHIER: '44444444-4444-4444-a444-444444444444',
  UNAUTHORIZED_USER: '55555555-5555-4555-a555-555555555555',
  STORE_A: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
  STORE_B: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb',
  PRODUCT_1: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
  VARIANT_1: 'dddddddd-dddd-4ddd-dddd-dddddddddddd',
  VARIANT_2: 'eeeeeeee-eeee-4eee-eeee-eeeeeeeeeeee',
  SUPPLIER_1: 'ffffffff-ffff-4fff-ffff-ffffffffffff',
  SESSION_1: '12345678-1234-4234-a234-123456789012',
} as const;

export function createMockUser(overrides?: Partial<any>) {
  return {
    id: overrides?.id ?? TEST_IDS.CASHIER,
    email: overrides?.email ?? 'cashier@store.local',
    name: overrides?.name ?? 'Test Cashier',
    passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$dummyhash',
    status: overrides?.status ?? 'ACTIVE',
    roles: overrides?.roles ?? [{ id: 'r1', userId: TEST_IDS.CASHIER, role: 'CASHIER' }],
    createdAt: new Date('2026-10-25T00:00:00Z'),
    updatedAt: new Date('2026-10-25T00:00:00Z'),
    ...overrides,
  };
}

export function createMockStore(overrides?: Partial<any>) {
  return {
    id: overrides?.id ?? TEST_IDS.STORE_A,
    name: overrides?.name ?? 'Downtown Branch',
    code: overrides?.code ?? 'BRANCH-01',
    status: overrides?.status ?? 'ACTIVE',
    timezone: 'UTC',
    createdAt: new Date('2026-10-25T00:00:00Z'),
    updatedAt: new Date('2026-10-25T00:00:00Z'),
    deletedAt: null,
    ...overrides,
  };
}

export function createMockMembership(userId: string, storeId: string, role = 'CASHIER') {
  return {
    id: `mem-${userId.slice(0, 4)}-${storeId.slice(0, 4)}`,
    userId,
    storeId,
    role,
    status: 'ACTIVE',
    createdAt: new Date('2026-10-25T00:00:00Z'),
    updatedAt: new Date('2026-10-25T00:00:00Z'),
    store: createMockStore({ id: storeId }),
  };
}

export function createMockVariant(overrides?: Partial<any>) {
  return {
    id: overrides?.id ?? TEST_IDS.VARIANT_1,
    productId: overrides?.productId ?? TEST_IDS.PRODUCT_1,
    name: overrides?.name ?? 'Standard Edition',
    sku: overrides?.sku ?? 'WIDGET-STD',
    barcode: overrides?.barcode ?? '123456789012',
    price: new Prisma.Decimal(overrides?.price ?? '29.99'),
    costPrice: new Prisma.Decimal(overrides?.costPrice ?? '15.00'),
    currency: 'USD',
    status: 'ACTIVE',
    product: {
      id: TEST_IDS.PRODUCT_1,
      name: 'Super Widget',
      status: 'ACTIVE',
      deletedAt: null,
    },
    ...overrides,
  };
}

export function createMockBalance(storeId: string, variantId: string, overrides?: Partial<any>) {
  return {
    id: `bal-${storeId.slice(0, 4)}-${variantId.slice(0, 4)}`,
    storeId,
    variantId,
    quantityOnHand: new Prisma.Decimal(overrides?.quantityOnHand ?? '50.0000'),
    quantityReserved: new Prisma.Decimal(overrides?.quantityReserved ?? '5.0000'),
    reorderLevel: new Prisma.Decimal(overrides?.reorderLevel ?? '10.0000'),
    createdAt: new Date('2026-10-25T00:00:00Z'),
    updatedAt: new Date('2026-10-25T00:00:00Z'),
    ...overrides,
  };
}
