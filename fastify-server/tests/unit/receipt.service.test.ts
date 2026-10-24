import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ReceiptService } from '../../src/modules/sales/receipt.service.js';
import { ReceiptNotFoundError, SaleNotFoundError } from '../../src/modules/sales/sale.errors.js';
import { AppError } from '../../src/common/errors/app-error.js';

describe('ReceiptService (Unit)', () => {
  let mockPrisma: any;
  let receiptService: ReceiptService;

  const saleId = '11111111-1111-4111-a111-111111111111';
  const storeId = '22222222-2222-4222-a222-222222222222';
  const receiptId = '33333333-3333-4333-a333-333333333333';

  const sampleCompletedSale = {
    id: saleId,
    saleNumber: 'SAL-20261024-1005',
    storeId,
    status: 'COMPLETED' as const,
    currencyCode: 'USD',
    subtotal: new Prisma.Decimal('100.00'),
    discountTotal: new Prisma.Decimal('0.00'),
    taxTotal: new Prisma.Decimal('0.00'),
    grandTotal: new Prisma.Decimal('100.00'),
    amountPaid: new Prisma.Decimal('100.00'),
    amountRefunded: new Prisma.Decimal('0.00'),
    cashierUserId: 'user-1',
    cashierUser: { id: 'user-1', name: 'Bob Cashier', email: 'bob@store.com' },
    store: {
      id: storeId,
      name: 'Main Street Store',
      code: 'MAIN-01',
      addressLine1: '456 Main St',
      city: 'Townsville',
      state: 'CA',
      phone: '555-0123',
    },
    items: [
      {
        id: 'item-1',
        saleId,
        variantId: 'var-1',
        skuSnapshot: 'ITEM-01',
        productNameSnapshot: 'Widget Standard',
        variantNameSnapshot: 'Standard',
        quantity: new Prisma.Decimal('2.0000'),
        unitPrice: new Prisma.Decimal('50.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        taxRate: new Prisma.Decimal('0.0000'),
        taxAmount: new Prisma.Decimal('0.00'),
        lineTotal: new Prisma.Decimal('100.00'),
      },
    ],
    payments: [
      {
        id: 'pay-1',
        paymentReference: 'PAY-20261024-1005',
        paymentMethod: 'CASH',
        status: 'CAPTURED',
        amount: new Prisma.Decimal('100.00'),
        currencyCode: 'USD',
        provider: 'CASH',
      },
    ],
  };

  const sampleReceipt = {
    id: receiptId,
    receiptNumber: 'REC-20261024-1005',
    saleId,
    storeId,
    storeNameSnapshot: 'Main Street Store',
    storeAddressSnapshot: '456 Main St, Townsville, CA',
    cashierNameSnapshot: 'Bob Cashier',
    receiptData: {
      saleNumber: 'SAL-20261024-1005',
      receiptNumber: 'REC-20261024-1005',
      issuedAt: '2026-10-24T10:00:00.000Z',
    },
    issuedAt: new Date('2026-10-24T10:00:00Z'),
    createdAt: new Date('2026-10-24T10:00:00Z'),
  };

  beforeEach(() => {
    mockPrisma = {
      sale: {
        findUnique: vi.fn(),
      },
      receipt: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ nextval: '1005' }]),
    };

    receiptService = new ReceiptService(mockPrisma as any);
  });

  it('generates receipt for completed sale and freezes snapshot data', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(sampleCompletedSale);
    mockPrisma.receipt.findUnique.mockResolvedValue(null);
    mockPrisma.receipt.create.mockResolvedValue(sampleReceipt);

    const result = await receiptService.generateReceiptForSale(saleId);

    expect(result.id).toBe(receiptId);
    expect(result.receiptNumber).toBe('REC-20261024-1005');
    expect(result.cashierNameSnapshot).toBe('Bob Cashier');
    expect(mockPrisma.receipt.create).toHaveBeenCalled();
  });

  it('returns existing receipt if already generated (idempotent)', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue(sampleCompletedSale);
    mockPrisma.receipt.findUnique.mockResolvedValue(sampleReceipt);

    const result = await receiptService.generateReceiptForSale(saleId);

    expect(result.id).toBe(receiptId);
    expect(mockPrisma.receipt.create).not.toHaveBeenCalled();
  });

  it('rejects receipt generation if sale is still in DRAFT status', async () => {
    mockPrisma.sale.findUnique.mockResolvedValue({
      ...sampleCompletedSale,
      status: 'DRAFT',
    });

    await expect(receiptService.generateReceiptForSale(saleId)).rejects.toThrow(
      AppError
    );
  });

  it('retrieves receipt by receiptId', async () => {
    mockPrisma.receipt.findUnique.mockResolvedValue(sampleReceipt);

    const result = await receiptService.getReceiptById(receiptId);
    expect(result.id).toBe(receiptId);
  });

  it('throws ReceiptNotFoundError when receiptId does not exist', async () => {
    mockPrisma.receipt.findUnique.mockResolvedValue(null);

    await expect(receiptService.getReceiptById('non-existent')).rejects.toThrow(
      ReceiptNotFoundError
    );
  });
});
