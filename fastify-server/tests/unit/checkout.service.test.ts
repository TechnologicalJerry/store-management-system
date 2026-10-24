import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { CheckoutService } from '../../src/modules/sales/checkout.service.js';
import {
  SaleInsufficientStockError,
  SaleItemInvalidError,
} from '../../src/modules/sales/sale.errors.js';

describe('CheckoutService (Unit)', () => {
  let mockPrisma: any;
  let checkoutService: CheckoutService;

  const storeId = '11111111-1111-4111-a111-111111111111';
  const variantId = '22222222-2222-4222-a222-222222222222';
  const cashierId = '33333333-3333-4333-a333-333333333333';
  const saleId = '44444444-4444-4444-a444-444444444444';

  const sampleVariant = {
    id: variantId,
    sku: 'SKU-001',
    name: 'Engine Oil 5W-30',
    price: new Prisma.Decimal('25.00'),
    currency: 'USD',
    status: 'ACTIVE',
    product: {
      id: 'prod-1',
      name: 'Synthetic Engine Oil',
      status: 'ACTIVE',
      deletedAt: null,
    },
  };

  const sampleBalance = {
    id: 'balance-1',
    store_id: storeId,
    variant_id: variantId,
    quantity_on_hand: new Prisma.Decimal('10.0000'),
    quantity_reserved: new Prisma.Decimal('0.0000'),
    reorder_level: new Prisma.Decimal('2.0000'),
  };

  const sampleCompletedSale = {
    id: saleId,
    saleNumber: 'SAL-20261024-1002',
    storeId,
    status: 'COMPLETED' as const,
    currencyCode: 'USD',
    subtotal: new Prisma.Decimal('50.00'),
    discountTotal: new Prisma.Decimal('0.00'),
    taxTotal: new Prisma.Decimal('0.00'),
    grandTotal: new Prisma.Decimal('50.00'),
    amountPaid: new Prisma.Decimal('50.00'),
    amountRefunded: new Prisma.Decimal('0.00'),
    cashierUserId: cashierId,
    idempotencyKey: null,
    notes: 'Direct POS checkout',
    completedAt: new Date('2026-10-24T10:05:00Z'),
    cancelledAt: null,
    createdAt: new Date('2026-10-24T10:05:00Z'),
    updatedAt: new Date('2026-10-24T10:05:00Z'),
    items: [
      {
        id: 'item-1',
        saleId,
        variantId,
        skuSnapshot: 'SKU-001',
        productNameSnapshot: 'Synthetic Engine Oil',
        variantNameSnapshot: 'Engine Oil 5W-30',
        quantity: new Prisma.Decimal('2.0000'),
        unitPrice: new Prisma.Decimal('25.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        taxRate: new Prisma.Decimal('0.0000'),
        taxAmount: new Prisma.Decimal('0.00'),
        lineTotal: new Prisma.Decimal('50.00'),
        createdAt: new Date('2026-10-24T10:05:00Z'),
      },
    ],
    payments: [
      {
        id: 'pay-1',
        paymentReference: 'PAY-20261024-1002',
        paymentMethod: 'CASH',
        status: 'CAPTURED',
        amount: new Prisma.Decimal('50.00'),
        currencyCode: 'USD',
        provider: 'CASH',
        capturedAt: new Date('2026-10-24T10:05:00Z'),
      },
    ],
    refunds: [],
    receipt: {
      id: 'rec-1',
      receiptNumber: 'REC-20261024-1002',
      issuedAt: new Date('2026-10-24T10:05:00Z'),
    },
    store: {
      id: storeId,
      name: 'Downtown Store',
      code: 'DT-01',
      addressLine1: '123 Main St',
      city: 'Metro',
      state: 'NY',
      phone: '555-0199',
    },
    cashierUser: { id: cashierId, name: 'Alice Cashier', email: 'alice@store.com' },
  };

  beforeEach(() => {
    mockPrisma = {
      productVariant: {
        findMany: vi.fn(),
      },
      sale: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      payment: {
        create: vi.fn(),
      },
      receipt: {
        create: vi.fn().mockResolvedValue({
          id: 'rec-1',
          receiptNumber: 'REC-20261024-1002',
          saleId,
          storeId,
          storeNameSnapshot: 'Downtown Store',
          storeAddressSnapshot: '123 Main St, Metro, NY',
          cashierNameSnapshot: 'Alice Cashier',
          receiptData: {},
          issuedAt: new Date(),
          createdAt: new Date(),
        }),
        findUnique: vi.fn().mockResolvedValue(null),
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
          return Promise.resolve([sampleBalance]);
        }
        return Promise.resolve([{ nextval: '1002' }]);
      }),
      $transaction: vi.fn().mockImplementation(async (cb: any) => cb(mockPrisma)),
    };

    checkoutService = new CheckoutService(mockPrisma as any);
  });

  it('completes direct cash checkout, deducts inventory, captures payment and issues receipt', async () => {
    mockPrisma.sale.findUnique
      .mockResolvedValueOnce(null) // idempotency check
      .mockResolvedValueOnce(sampleCompletedSale); // final retrieval
    mockPrisma.productVariant.findMany.mockResolvedValue([sampleVariant]);
    mockPrisma.sale.create.mockResolvedValue(sampleCompletedSale);

    const result = await checkoutService.processDirectCheckout(cashierId, {
      storeId,
      currencyCode: 'USD',
      paymentMethod: 'CASH',
      amountTendered: '60.00',
      items: [{ variantId, quantity: '2' }],
    });

    expect(result.status).toBe('COMPLETED');
    expect(result.grandTotal).toBe('50.00');
    expect(result.changeDue).toBe('10.00');
    expect(result.receipt).toBeDefined();
    expect(mockPrisma.inventoryBalance.update).toHaveBeenCalled();
    expect(mockPrisma.inventoryMovement.create).toHaveBeenCalled();
  });

  it('rejects checkout if stock is insufficient', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(null);
    mockPrisma.productVariant.findMany.mockResolvedValue([sampleVariant]);

    // Mock balance with only 1 item on hand when 5 are requested
    mockPrisma.$queryRaw.mockImplementation((query: any) => {
      const sql = query?.strings?.join(' ') ?? '';
      if (sql.includes('SELECT id, store_id, variant_id, quantity_on_hand')) {
        return Promise.resolve([
          {
            ...sampleBalance,
            quantity_on_hand: new Prisma.Decimal('1.0000'),
          },
        ]);
      }
      return Promise.resolve([{ nextval: '1002' }]);
    });

    await expect(
      checkoutService.processDirectCheckout(cashierId, {
        storeId,
        paymentMethod: 'CASH',
        items: [{ variantId, quantity: '5' }],
      })
    ).rejects.toThrow(SaleInsufficientStockError);
  });

  it('rejects cash checkout if cash tendered is less than grand total', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(null);
    mockPrisma.productVariant.findMany.mockResolvedValue([sampleVariant]);

    await expect(
      checkoutService.processDirectCheckout(cashierId, {
        storeId,
        paymentMethod: 'CASH',
        amountTendered: '10.00', // Total is 25.00
        items: [{ variantId, quantity: '1' }],
      })
    ).rejects.toThrow(SaleItemInvalidError);
  });
});
