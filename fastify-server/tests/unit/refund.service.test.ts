import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { RefundService } from '../../src/modules/payments/refund.service.js';
import {
  PaymentInvalidStateTransitionError,
  RefundAmountExceedsCapturedError,
  RefundNotFoundError,
} from '../../src/modules/payments/payment.errors.js';

describe('RefundService (Unit)', () => {
  let mockPrisma: any;
  let refundService: RefundService;

  const paymentId = '11111111-1111-4111-a111-111111111111';
  const saleId = '22222222-2222-4222-a222-222222222222';
  const userId = '33333333-3333-4333-a333-333333333333';
  const refundId = '44444444-4444-4444-a444-444444444444';

  const samplePayment = {
    id: paymentId,
    saleId,
    paymentReference: 'PAY-20261024-1004',
    paymentMethod: 'CARD' as const,
    status: 'CAPTURED' as const,
    amount: new Prisma.Decimal('100.00'),
    currencyCode: 'USD',
    provider: 'MOCK_DIGITAL',
    providerTransactionId: 'mock_tx_9999',
    idempotencyKey: null,
    initiatedAt: new Date('2026-10-24T10:00:00Z'),
    capturedAt: new Date('2026-10-24T10:00:00Z'),
    createdAt: new Date('2026-10-24T10:00:00Z'),
    updatedAt: new Date('2026-10-24T10:00:00Z'),
  };

  const sampleSale = {
    id: saleId,
    saleNumber: 'SAL-20261024-1004',
    storeId: 'store-1',
    status: 'COMPLETED' as const,
    grandTotal: new Prisma.Decimal('100.00'),
    amountPaid: new Prisma.Decimal('100.00'),
    amountRefunded: new Prisma.Decimal('0.00'),
  };

  const sampleRefund = {
    id: refundId,
    paymentId,
    saleId,
    refundReference: 'REF-20261024-1004',
    amount: new Prisma.Decimal('40.00'),
    currencyCode: 'USD',
    status: 'SUCCEEDED' as const,
    reason: 'Customer return',
    providerRefundId: 'mock_ref_123',
    idempotencyKey: null,
    requestedByUserId: userId,
    processedAt: new Date('2026-10-24T10:30:00Z'),
    createdAt: new Date('2026-10-24T10:30:00Z'),
    updatedAt: new Date('2026-10-24T10:30:00Z'),
  };

  beforeEach(() => {
    mockPrisma = {
      payment: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      sale: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      refund: {
        findUnique: vi.fn(),
        create: vi.fn(),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal('0.00') } }),
        findMany: vi.fn(),
      },
      inventoryBalance: {
        update: vi.fn(),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ nextval: '1004' }]),
      $transaction: vi.fn().mockImplementation(async cb => cb(mockPrisma)),
    };

    refundService = new RefundService(mockPrisma as any);
  });

  it('processes partial refund and updates payment and sale to PARTIALLY_REFUNDED', async () => {
    mockPrisma.refund.findUnique.mockResolvedValueOnce(null); // idempotency check
    mockPrisma.payment.findUnique.mockResolvedValue(samplePayment);
    mockPrisma.refund.create.mockResolvedValue(sampleRefund);
    mockPrisma.sale.findUnique.mockResolvedValue(sampleSale);

    const result = await refundService.processRefund(paymentId, userId, {
      paymentId,
      amount: '40.00',
      reason: 'Customer return',
    });

    expect(result.status).toBe('SUCCEEDED');
    expect(result.amount).toBe('40.00');

    // Verify payment updated to PARTIALLY_REFUNDED
    expect(mockPrisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: paymentId },
        data: { status: 'PARTIALLY_REFUNDED' },
      })
    );

    // Verify sale updated to PARTIALLY_REFUNDED
    expect(mockPrisma.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: saleId },
        data: expect.objectContaining({
          status: 'PARTIALLY_REFUNDED',
          amountRefunded: expect.any(Prisma.Decimal),
        }),
      })
    );

    // Critical assertion: refunds must NOT automatically modify inventory balances
    expect(mockPrisma.inventoryBalance.update).not.toHaveBeenCalled();
  });

  it('rejects refund if requested amount exceeds captured balance', async () => {
    mockPrisma.refund.findUnique.mockResolvedValue(null);
    mockPrisma.payment.findUnique.mockResolvedValue(samplePayment);

    await expect(
      refundService.processRefund(paymentId, userId, {
        paymentId,
        amount: '150.00', // Captured is only 100.00
        reason: 'Over-refund',
      })
    ).rejects.toThrow(RefundAmountExceedsCapturedError);
  });

  it('rejects refund if payment is not in CAPTURED status', async () => {
    mockPrisma.refund.findUnique.mockResolvedValue(null);
    mockPrisma.payment.findUnique.mockResolvedValue({
      ...samplePayment,
      status: 'PENDING',
    });

    await expect(
      refundService.processRefund(paymentId, userId, {
        paymentId,
        amount: '10.00',
        reason: 'Refund uncaptured',
      })
    ).rejects.toThrow(PaymentInvalidStateTransitionError);
  });
});
