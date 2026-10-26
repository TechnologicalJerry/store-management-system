import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { ReportRepository } from '../../src/modules/reports/report.repository.js';

describe('ReportRepository (Unit)', () => {
  let mockPrisma: any;
  let repository: ReportRepository;
  const storeId = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    mockPrisma = {
      sale: {
        findMany: vi.fn(),
      },
      saleItem: {
        findMany: vi.fn(),
      },
      payment: {
        findMany: vi.fn(),
      },
      inventoryBalance: {
        count: vi.fn(),
        findMany: vi.fn(),
      },
      purchaseOrder: {
        findMany: vi.fn(),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ nextval: 1005 }]),
    };
    repository = new ReportRepository(mockPrisma as any);
  });

  it('calculates gross sales, refunds, and net sales with exact decimals', async () => {
    mockPrisma.sale.findMany.mockResolvedValue([
      {
        id: 's1',
        status: 'COMPLETED',
        grandTotal: new Prisma.Decimal('100.50'),
        discountTotal: new Prisma.Decimal('5.00'),
        amountRefunded: new Prisma.Decimal('0.00'),
        createdAt: new Date('2026-10-24T10:00:00Z'),
      },
      {
        id: 's2',
        status: 'PARTIALLY_REFUNDED',
        grandTotal: new Prisma.Decimal('50.00'),
        discountTotal: new Prisma.Decimal('0.00'),
        amountRefunded: new Prisma.Decimal('20.00'),
        createdAt: new Date('2026-10-24T12:00:00Z'),
      },
      {
        id: 's3',
        status: 'CANCELLED',
        grandTotal: new Prisma.Decimal('30.00'),
        discountTotal: new Prisma.Decimal('0.00'),
        amountRefunded: new Prisma.Decimal('0.00'),
        createdAt: new Date('2026-10-24T14:00:00Z'),
      },
    ]);

    const result = await repository.getSalesSummary(
      storeId,
      new Date('2026-10-24T00:00:00Z'),
      new Date('2026-10-24T23:59:59Z'),
      'day'
    );

    // Cancelled sales should not count towards revenue totals
    expect(result.totalOrders).toBe(2);
    expect(result.grossSales).toBe('150.50');
    expect(result.refunds).toBe('20.00');
    expect(result.netSales).toBe('130.50');
    expect(result.discounts).toBe('5.00');
  });

  it('aggregates top-selling products by quantity and revenue', async () => {
    mockPrisma.saleItem.findMany.mockResolvedValue([
      {
        variantId: 'v1',
        quantity: new Prisma.Decimal('5'),
        lineTotal: new Prisma.Decimal('100.00'),
        skuSnapshot: 'SKU-1',
        productNameSnapshot: 'Item 1',
        variantNameSnapshot: 'Var 1',
        variant: { product: { id: 'p1', name: 'Item 1' }, name: 'Var 1', sku: 'SKU-1' },
      },
      {
        variantId: 'v1',
        quantity: new Prisma.Decimal('3'),
        lineTotal: new Prisma.Decimal('60.00'),
        skuSnapshot: 'SKU-1',
        productNameSnapshot: 'Item 1',
        variantNameSnapshot: 'Var 1',
        variant: { product: { id: 'p1', name: 'Item 1' }, name: 'Var 1', sku: 'SKU-1' },
      },
      {
        variantId: 'v2',
        quantity: new Prisma.Decimal('2'),
        lineTotal: new Prisma.Decimal('50.00'),
        skuSnapshot: 'SKU-2',
        productNameSnapshot: 'Item 2',
        variantNameSnapshot: 'Var 2',
        variant: { product: { id: 'p2', name: 'Item 2' }, name: 'Var 2', sku: 'SKU-2' },
      },
    ]);

    const result = await repository.getTopProducts(
      storeId,
      new Date('2026-10-01T00:00:00Z'),
      new Date('2026-10-24T23:59:59Z'),
      10
    );

    expect(result.items).toHaveLength(2);
    expect(result.items[0].sku).toBe('SKU-1');
    expect(result.items[0].quantitySold).toBe(8);
    expect(result.items[0].grossRevenue).toBe('160.00');
  });

  it('calculates inventory valuation correctly from variant cost price', async () => {
    mockPrisma.inventoryBalance.count.mockResolvedValue(1);
    mockPrisma.inventoryBalance.findMany.mockResolvedValue([
      {
        variantId: 'v1',
        quantityOnHand: new Prisma.Decimal('10.0000'),
        quantityReserved: new Prisma.Decimal('2.0000'),
        reorderLevel: new Prisma.Decimal('5.0000'),
        variant: {
          productId: 'p1',
          name: 'Var 1',
          sku: 'SKU-1',
          costPrice: new Prisma.Decimal('15.50'),
          product: { id: 'p1', name: 'Product 1' },
        },
      },
    ]);

    const result = await repository.getInventorySummary(storeId, undefined, 1, 50);

    expect(result.totalSkus).toBe(1);
    expect(result.totalQuantityOnHand).toBe(10);
    expect(result.totalAllocatedQuantity).toBe(2);
    expect(result.totalAvailableQuantity).toBe(8);
    expect(result.totalInventoryValuation).toBe('155.00');
  });

  it('detects low-stock items based on available stock and reorder thresholds', async () => {
    mockPrisma.inventoryBalance.findMany.mockResolvedValue([
      {
        variantId: 'v1',
        quantityOnHand: new Prisma.Decimal('5.0000'),
        quantityReserved: new Prisma.Decimal('3.0000'), // available = 2
        reorderLevel: new Prisma.Decimal('10.0000'), // threshold = 10, shortfall = 8
        variant: {
          productId: 'p1',
          name: 'Var 1',
          sku: 'SKU-LOW',
          product: { id: 'p1', name: 'Critical Item' },
        },
      },
      {
        variantId: 'v2',
        quantityOnHand: new Prisma.Decimal('20.0000'),
        quantityReserved: new Prisma.Decimal('0.0000'), // available = 20
        reorderLevel: new Prisma.Decimal('5.0000'), // threshold = 5, healthy
        variant: {
          productId: 'p2',
          name: 'Var 2',
          sku: 'SKU-OK',
          product: { id: 'p2', name: 'Healthy Item' },
        },
      },
    ]);

    const result = await repository.getLowStockItems(storeId, 1, 50);

    expect(result.lowStockCount).toBe(1);
    expect(result.items[0].sku).toBe('SKU-LOW');
    expect(result.items[0].shortfall).toBe(8);
  });
});
