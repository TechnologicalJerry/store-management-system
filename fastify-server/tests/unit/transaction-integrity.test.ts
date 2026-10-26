import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { CheckoutService } from '../../src/modules/sales/checkout.service.js';
import { RefundService } from '../../src/modules/payments/refund.service.js';
import {
  RefundAmountExceededError,
  PaymentNotRefundableError,
} from '../../src/modules/payments/payment.errors.js';
import { InsufficientStockError } from '../../src/modules/inventory/inventory.errors.js';
import { TEST_IDS, createMockVariant, createMockBalance } from '../helpers/test-fixtures.js';

describe('Transaction Boundaries & Financial Integrity (Unit)', () => {
  describe('Deadlock-Safe Checkout Lock Ordering', () => {
    it('sorts cart line items deterministically by variantId before acquiring row locks', async () => {
      const mockTx: any = {
        inventoryBalance: {
          findUnique: vi.fn(),
          update: vi.fn(),
        },
        inventoryMovement: { create: vi.fn() },
        sale: { create: vi.fn() },
        saleItem: { createMany: vi.fn() },
        payment: { create: vi.fn() },
        receipt: { create: vi.fn() },
      };

      const mockPrisma: any = {
        store: { findUnique: vi.fn().mockResolvedValue({ id: TEST_IDS.STORE_A, status: 'ACTIVE' }) },
        productVariant: {
          findMany: vi.fn().mockResolvedValue([
            createMockVariant({ id: 'variant-z', price: '10.00' }),
            createMockVariant({ id: 'variant-a', price: '20.00' }),
            createMockVariant({ id: 'variant-m', price: '30.00' }),
          ]),
        },
        $transaction: vi.fn().mockImplementation(async cb => cb(mockTx)),
        $queryRaw: vi.fn().mockResolvedValue([{ nextval: 1001 }]),
      };

      // Mock balances with sufficient stock
      mockTx.inventoryBalance.findUnique.mockImplementation(({ where }: any) => {
        return Promise.resolve(createMockBalance(TEST_IDS.STORE_A, where.storeId_variantId.variantId, {
          quantityOnHand: '100.0000',
          quantityReserved: '0.0000',
        }));
      });

      const checkoutService = new CheckoutService(mockPrisma as any);

      // Pass items in intentionally reverse/unordered sequence
      const unorderedCart = [
        { variantId: 'variant-z', quantity: '1.0000' },
        { variantId: 'variant-a', quantity: '1.0000' },
        { variantId: 'variant-m', quantity: '1.0000' },
      ];

      await checkoutService.processDirectCheckout({
        storeId: TEST_IDS.STORE_A,
        cashierUserId: TEST_IDS.CASHIER,
        paymentMethod: 'CASH',
        amountTendered: '100.00',
        items: unorderedCart,
      });

      // Verify row locks were requested in strictly alphabetical order: variant-a, variant-m, variant-z
      const lockedVariantIds = mockTx.inventoryBalance.findUnique.mock.calls.map(
        (call: any) => call[0].where.storeId_variantId.variantId
      );

      expect(lockedVariantIds).toEqual(['variant-a', 'variant-m', 'variant-z']);
    });

    it('aborts checkout atomically if any item has insufficient available stock', async () => {
      const mockTx: any = {
        inventoryBalance: {
          findUnique: vi.fn().mockResolvedValue(
            createMockBalance(TEST_IDS.STORE_A, TEST_IDS.VARIANT_1, {
              quantityOnHand: '2.0000',
              quantityReserved: '2.0000', // Available = 0
            })
          ),
          update: vi.fn(),
        },
        inventoryMovement: { create: vi.fn() },
      };

      const mockPrisma: any = {
        store: { findUnique: vi.fn().mockResolvedValue({ id: TEST_IDS.STORE_A, status: 'ACTIVE' }) },
        productVariant: {
          findMany: vi.fn().mockResolvedValue([createMockVariant({ id: TEST_IDS.VARIANT_1, price: '10.00' })]),
        },
        $transaction: vi.fn().mockImplementation(async cb => cb(mockTx)),
      };

      const checkoutService = new CheckoutService(mockPrisma as any);

      await expect(
        checkoutService.processDirectCheckout({
          storeId: TEST_IDS.STORE_A,
          cashierUserId: TEST_IDS.CASHIER,
          paymentMethod: 'CASH',
          amountTendered: '50.00',
          items: [{ variantId: TEST_IDS.VARIANT_1, quantity: '1.0000' }],
        })
      ).rejects.toThrow(InsufficientStockError);

      // Ensure balance update and movement creation were NOT invoked
      expect(mockTx.inventoryBalance.update).not.toHaveBeenCalled();
      expect(mockTx.inventoryMovement.create).not.toHaveBeenCalled();
    });
  });

  describe('Refund Financial Safeguards', () => {
    it('strictly forbids refunding an amount greater than the eligible captured payment', async () => {
      const mockPrisma: any = {
        payment: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'pay-1',
            status: 'CAPTURED',
            amount: new Prisma.Decimal('100.00'),
            currencyCode: 'USD',
            refunds: [
              // Already refunded $80
              { status: 'SUCCEEDED', amount: new Prisma.Decimal('80.00') },
            ],
          }),
        },
      };

      const refundService = new RefundService(mockPrisma as any);

      // Attempt to refund $25 when only $20 remains refundable ($100 - $80 = $20)
      await expect(
        refundService.requestRefund('pay-1', {
          amount: '25.00',
          reason: 'Customer return',
        })
      ).rejects.toThrow(RefundAmountExceededError);
    });

    it('rejects refund attempts against uncaptured or pending payments', async () => {
      const mockPrisma: any = {
        payment: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'pay-2',
            status: 'PENDING',
            amount: new Prisma.Decimal('100.00'),
            refunds: [],
          }),
        },
      };

      const refundService = new RefundService(mockPrisma as any);

      await expect(
        refundService.requestRefund('pay-2', {
          amount: '50.00',
          reason: 'Cancellation',
        })
      ).rejects.toThrow(PaymentNotRefundableError);
    });
  });

  describe('Exact Decimal Precision Math', () => {
    it('performs exact decimal monetary operations avoiding IEEE 754 floating point issues', () => {
      const val1 = new Prisma.Decimal('0.10');
      const val2 = new Prisma.Decimal('0.20');
      const sum = val1.add(val2);

      // In standard JS floating point: 0.1 + 0.2 === 0.30000000000000004
      expect(sum.toFixed(2)).toBe('0.30');
      expect(sum.equals(new Prisma.Decimal('0.30'))).toBe(true);
    });
  });
});
