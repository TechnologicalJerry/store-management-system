import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { SaleService } from '../../src/modules/sales/sale.service.js';
import {
  SaleAlreadyCompletedError,
  SaleCurrencyMismatchError,
  SaleInvalidStateTransitionError,
  SaleItemInvalidError,
  SaleNotFoundError,
} from '../../src/modules/sales/sale.errors.js';

describe('SaleService (Unit)', () => {
  let mockPrisma: any;
  let saleService: SaleService;

  const storeId = '11111111-1111-4111-a111-111111111111';
  const variantId = '22222222-2222-4222-a222-222222222222';
  const cashierId = '33333333-3333-4333-a333-333333333333';
  const saleId = '44444444-4444-4444-a444-444444444444';

  const sampleVariant = {
    id: variantId,
    sku: 'WIDGET-01',
    name: 'Standard Widget',
    price: new Prisma.Decimal('19.99'),
    currency: 'USD',
    status: 'ACTIVE',
    product: {
      id: 'prod-1',
      name: 'Super Widget',
      status: 'ACTIVE',
      deletedAt: null,
    },
  };

  const sampleSale = {
    id: saleId,
    saleNumber: 'SAL-20261024-1001',
    storeId,
    status: 'DRAFT' as const,
    currencyCode: 'USD',
    subtotal: new Prisma.Decimal('39.98'),
    discountTotal: new Prisma.Decimal('0.00'),
    taxTotal: new Prisma.Decimal('0.00'),
    grandTotal: new Prisma.Decimal('39.98'),
    amountPaid: new Prisma.Decimal('0.00'),
    amountRefunded: new Prisma.Decimal('0.00'),
    cashierUserId: cashierId,
    idempotencyKey: null,
    notes: 'Draft customer cart',
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-10-24T10:00:00Z'),
    updatedAt: new Date('2026-10-24T10:00:00Z'),
    items: [
      {
        id: 'item-1',
        saleId,
        variantId,
        skuSnapshot: 'WIDGET-01',
        productNameSnapshot: 'Super Widget',
        variantNameSnapshot: 'Standard Widget',
        quantity: new Prisma.Decimal('2.0000'),
        unitPrice: new Prisma.Decimal('19.99'),
        discountAmount: new Prisma.Decimal('0.00'),
        taxRate: new Prisma.Decimal('0.0000'),
        taxAmount: new Prisma.Decimal('0.00'),
        lineTotal: new Prisma.Decimal('39.98'),
        createdAt: new Date('2026-10-24T10:00:00Z'),
      },
    ],
    payments: [],
    refunds: [],
    receipt: null,
    store: { id: storeId, name: 'Downtown Branch', code: 'DT-01' },
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
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ nextval: '1001' }]),
      $transaction: vi.fn().mockImplementation(async cb => cb(mockPrisma)),
    };

    saleService = new SaleService(mockPrisma as any);
  });

  describe('createSale', () => {
    it('creates a draft sale with server-side authoritative pricing', async () => {
      mockPrisma.sale.findUnique.mockResolvedValue(null);
      mockPrisma.productVariant.findMany.mockResolvedValue([sampleVariant]);
      mockPrisma.sale.create.mockResolvedValue(sampleSale);

      const result = await saleService.createSale(cashierId, {
        storeId,
        currencyCode: 'USD',
        items: [{ variantId, quantity: '2' }],
      });

      expect(result.id).toBe(saleId);
      expect(result.saleNumber).toBe('SAL-20261024-1001');
      expect(result.grandTotal).toBe('39.98');
      expect(result.status).toBe('DRAFT');
      expect(mockPrisma.sale.create).toHaveBeenCalled();
    });

    it('rejects if variant does not exist', async () => {
      mockPrisma.sale.findUnique.mockResolvedValue(null);
      mockPrisma.productVariant.findMany.mockResolvedValue([]);

      await expect(
        saleService.createSale(cashierId, {
          storeId,
          currencyCode: 'USD',
          items: [{ variantId, quantity: '1' }],
        })
      ).rejects.toThrow(SaleItemInvalidError);
    });

    it('rejects if currency does not match variant currency', async () => {
      mockPrisma.sale.findUnique.mockResolvedValue(null);
      mockPrisma.productVariant.findMany.mockResolvedValue([sampleVariant]);

      await expect(
        saleService.createSale(cashierId, {
          storeId,
          currencyCode: 'EUR',
          items: [{ variantId, quantity: '1' }],
        })
      ).rejects.toThrow(SaleCurrencyMismatchError);
    });

    it('returns existing sale if idempotency key already exists', async () => {
      mockPrisma.sale.findUnique.mockResolvedValue(sampleSale);

      const result = await saleService.createSale(cashierId, {
        storeId,
        currencyCode: 'USD',
        idempotencyKey: 'idemp-123',
        items: [{ variantId, quantity: '2' }],
      });

      expect(result.id).toBe(saleId);
      expect(mockPrisma.sale.create).not.toHaveBeenCalled();
    });
  });

  describe('getSaleById', () => {
    it('retrieves sale by ID', async () => {
      mockPrisma.sale.findUnique.mockResolvedValue(sampleSale);

      const result = await saleService.getSaleById(saleId);
      expect(result.id).toBe(saleId);
      expect(result.items).toHaveLength(1);
    });

    it('throws SaleNotFoundError if sale not found', async () => {
      mockPrisma.sale.findUnique.mockResolvedValue(null);

      await expect(saleService.getSaleById('missing-id')).rejects.toThrow(
        SaleNotFoundError
      );
    });
  });

  describe('cancelSale', () => {
    it('cancels draft sale successfully', async () => {
      mockPrisma.sale.findUnique.mockResolvedValue(sampleSale);
      mockPrisma.sale.update.mockResolvedValue({
        ...sampleSale,
        status: 'CANCELLED',
        cancelledAt: new Date(),
      });

      const result = await saleService.cancelSale(saleId, cashierId, 'Customer changed mind');
      expect(result.status).toBe('CANCELLED');
    });

    it('rejects cancellation if sale is already COMPLETED', async () => {
      mockPrisma.sale.findUnique.mockResolvedValue({
        ...sampleSale,
        status: 'COMPLETED',
      });

      await expect(
        saleService.cancelSale(saleId, cashierId, 'Try cancel completed')
      ).rejects.toThrow(SaleAlreadyCompletedError);
    });
  });
});
