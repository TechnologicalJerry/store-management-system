import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { PaymentService } from '../../src/modules/payments/payment.service.js';
import {
  PaymentAlreadyCapturedError,
  PaymentAmountExceedsSaleError,
  PaymentInvalidStateTransitionError,
  PaymentNotFoundError,
} from '../../src/modules/payments/payment.errors.js';

describe('PaymentService (Unit)', () => {
  let mockPrisma: any;
  let paymentService: PaymentService;

  const saleId = '11111111-1111-4111-a111-111111111111';
  const cashierId = '22222222-2222-4222-a222-222222222222';
  const paymentId = '33333333-3333-4333-a333-333333333333';

  const sampleSale = {
    id: saleId,
    saleNumber: 'SAL-20261024-1003',
    storeId: 'store-1',
    status: 'PENDING_PAYMENT' as const,
    currencyCode: 'USD',
    subtotal: new Prisma.Decimal('100.00'),
    discountTotal: new Prisma.Decimal('0.00'),
    taxTotal: new Prisma.Decimal('0.00'),
    grandTotal: new Prisma.Decimal('100.00'),
    amountPaid: new Prisma.Decimal('0.00'),
    amountRefunded: new Prisma.Decimal('0.00'),
    store: { id: 'store-1', name: 'Downtown Store', code: 'DT-01' },
    items: [],
    payments: [],
    refunds: [],
    receipt: null,
  };

  const samplePayment = {
    id: paymentId,
    saleId,
    paymentReference: 'PAY-20261024-1003',
    paymentMethod: 'CARD' as const,
    status: 'CAPTURED' as const,
    amount: new Prisma.Decimal('100.00'),
    currencyCode: 'USD',
    provider: 'MOCK_DIGITAL',
    providerTransactionId: 'mock_tx_12345',
    idempotencyKey: null,
    failureCode: null,
    failureMessage: null,
    initiatedAt: new Date('2026-10-24T10:10:00Z'),
    authorizedAt: null,
    capturedAt: new Date('2026-10-24T10:10:00Z'),
    failedAt: null,
    createdAt: new Date('2026-10-24T10:10:00Z'),
    updatedAt: new Date('2026-10-24T10:10:00Z'),
    refunds: [],
  };

  beforeEach(() => {
    mockPrisma = {
      sale: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      payment: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
      },
      receipt: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: 'rec-1',
          receiptNumber: 'REC-20261024-1003',
          saleId,
          storeId: 'store-1',
          storeNameSnapshot: 'Downtown Store',
          cashierNameSnapshot: 'Cashier',
          receiptData: {},
          issuedAt: new Date(),
          createdAt: new Date(),
        }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ nextval: '1003' }]),
      $transaction: vi.fn().mockImplementation(async cb => cb(mockPrisma)),
    };

    paymentService = new PaymentService(mockPrisma as any);
  });

  describe('recordOrInitiatePayment', () => {
    it('processes digital payment with mock digital provider and completes sale', async () => {
      mockPrisma.payment.findUnique.mockResolvedValueOnce(null); // idempotency check
      mockPrisma.sale.findUnique.mockResolvedValue(sampleSale);
      mockPrisma.payment.create.mockResolvedValue(samplePayment);

      const result = await paymentService.recordOrInitiatePayment(saleId, cashierId, {
        saleId,
        paymentMethod: 'CARD',
        amount: '100.00',
        provider: 'MOCK_DIGITAL',
      });

      expect(result.status).toBe('CAPTURED');
      expect(result.amount).toBe('100.00');
      expect(mockPrisma.sale.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'COMPLETED',
          }),
        })
      );
    });

    it('rejects payment if amount exceeds remaining balance due', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(null);
      mockPrisma.sale.findUnique.mockResolvedValue(sampleSale);

      await expect(
        paymentService.recordOrInitiatePayment(saleId, cashierId, {
          saleId,
          paymentMethod: 'CARD',
          amount: '150.00', // Due is only 100.00
        })
      ).rejects.toThrow(PaymentAmountExceedsSaleError);
    });

    it('returns existing payment if idempotency key matches', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(samplePayment);

      const result = await paymentService.recordOrInitiatePayment(saleId, cashierId, {
        saleId,
        paymentMethod: 'CARD',
        amount: '100.00',
        idempotencyKey: 'idemp-pay-1',
      });

      expect(result.id).toBe(paymentId);
      expect(mockPrisma.payment.create).not.toHaveBeenCalled();
    });
  });

  describe('capturePayment', () => {
    it('rejects capture if payment is already captured', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(samplePayment);

      await expect(
        paymentService.capturePayment(paymentId, {})
      ).rejects.toThrow(PaymentAlreadyCapturedError);
    });

    it('captures an authorized payment successfully', async () => {
      const authorizedPayment = {
        ...samplePayment,
        status: 'AUTHORIZED' as const,
        capturedAt: null,
      };
      mockPrisma.payment.findUnique.mockResolvedValue(authorizedPayment);
      mockPrisma.payment.update.mockResolvedValue({
        ...authorizedPayment,
        status: 'CAPTURED',
        capturedAt: new Date(),
      });
      mockPrisma.sale.findUnique.mockResolvedValue(sampleSale);

      const result = await paymentService.capturePayment(paymentId, {});
      expect(result.status).toBe('CAPTURED');
    });
  });

  describe('voidPayment', () => {
    it('voids an authorized uncaptured payment', async () => {
      const authorizedPayment = {
        ...samplePayment,
        status: 'AUTHORIZED' as const,
        capturedAt: null,
      };
      mockPrisma.payment.findUnique.mockResolvedValue(authorizedPayment);
      mockPrisma.payment.update.mockResolvedValue({
        ...authorizedPayment,
        status: 'CANCELLED',
      });

      const result = await paymentService.voidPayment(paymentId, { reason: 'Customer cancelled' });
      expect(result.status).toBe('CANCELLED');
    });

    it('rejects voiding if payment was already captured', async () => {
      mockPrisma.payment.findUnique.mockResolvedValue(samplePayment);

      await expect(
        paymentService.voidPayment(paymentId, { reason: 'Try void captured' })
      ).rejects.toThrow(PaymentInvalidStateTransitionError);
    });
  });
});
