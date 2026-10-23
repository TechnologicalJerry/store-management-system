import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { PurchaseOrderService } from '../../src/modules/procurement/purchase-order.service.js';
import {
  EmptyPurchaseOrderItemsError,
  InactiveStoreForOrderError,
  InactiveSupplierForOrderError,
  InvalidPurchaseOrderStateError,
  PurchaseOrderImmutableError,
  PurchaseOrderNotFoundError,
  SeparationOfDutiesError,
} from '../../src/modules/procurement/procurement.errors.js';

describe('PurchaseOrderService (Unit)', () => {
  let mockPrisma: any;
  let poService: PurchaseOrderService;

  const supplierId = '11111111-1111-4111-a111-111111111111';
  const storeId = '22222222-2222-4222-a222-222222222222';
  const variantId = '33333333-3333-4333-a333-333333333333';
  const creatorId = '44444444-4444-4444-a444-444444444444';
  const approverId = '55555555-5555-4555-a555-555555555555';
  const poId = '66666666-6666-4666-a666-666666666666';
  const mockDate = new Date('2026-10-23T12:00:00Z');

  const sampleSupplier = {
    id: supplierId,
    name: 'Premier Parts Supply',
    code: 'PREMIER-01',
    status: 'ACTIVE',
    deletedAt: null,
  };

  const sampleStore = {
    id: storeId,
    name: 'Downtown Main Store',
    code: 'DT-01',
    status: 'ACTIVE',
    deletedAt: null,
  };

  const sampleVariant = {
    id: variantId,
    name: 'Brake Rotor 300mm',
    sku: 'ROTOR-300',
    costPrice: new Prisma.Decimal('45.00'),
    status: 'ACTIVE',
    product: { id: 'prod-1', name: 'Brake Rotors', slug: 'brake-rotors' },
  };

  const sampleSupplierProduct = {
    id: 'sp-1',
    supplierId,
    variantId,
    supplierSku: 'PPS-ROTOR-300',
    purchasePrice: new Prisma.Decimal('40.00'),
  };

  const samplePo = {
    id: poId,
    purchaseOrderNumber: 'PO-20261023-1001',
    supplierId,
    destinationStoreId: storeId,
    status: 'DRAFT' as const,
    currencyCode: 'USD',
    subtotal: new Prisma.Decimal('400.00'),
    discountTotal: new Prisma.Decimal('0.00'),
    taxTotal: new Prisma.Decimal('20.00'),
    shippingTotal: new Prisma.Decimal('50.00'),
    grandTotal: new Prisma.Decimal('470.00'),
    notes: 'Urgent brake parts restock',
    createdByUserId: creatorId,
    approvedByUserId: null,
    approvedAt: null,
    orderedAt: null,
    expectedDeliveryAt: null,
    cancelledAt: null,
    createdAt: mockDate,
    updatedAt: mockDate,
    supplier: sampleSupplier,
    destinationStore: sampleStore,
    items: [
      {
        id: 'po-item-1',
        purchaseOrderId: poId,
        variantId,
        supplierProductId: 'sp-1',
        skuSnapshot: 'ROTOR-300',
        productNameSnapshot: 'Brake Rotor 300mm',
        supplierSkuSnapshot: 'PPS-ROTOR-300',
        quantityOrdered: new Prisma.Decimal('10.0000'),
        quantityReceived: new Prisma.Decimal('0.0000'),
        unitPrice: new Prisma.Decimal('40.00'),
        discountAmount: new Prisma.Decimal('0.00'),
        taxRate: new Prisma.Decimal('0.0500'),
        lineTotal: new Prisma.Decimal('420.00'),
        createdAt: mockDate,
        updatedAt: mockDate,
        variant: sampleVariant,
      },
    ],
    statusHistory: [],
    _count: { goodsReceipts: 0 },
  };

  beforeEach(() => {
    mockPrisma = {
      supplier: {
        findFirst: vi.fn(),
      },
      store: {
        findFirst: vi.fn(),
      },
      productVariant: {
        findUnique: vi.fn(),
      },
      supplierProduct: {
        findUnique: vi.fn(),
      },
      purchaseOrder: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      purchaseOrderItem: {
        deleteMany: vi.fn(),
        createMany: vi.fn(),
      },
      purchaseOrderStatusHistory: {
        create: vi.fn(),
      },
      $transaction: vi.fn((callback: any) => callback(mockPrisma)),
      $queryRaw: vi.fn().mockResolvedValue([{ nextval: 1001 }]),
    };

    poService = new PurchaseOrderService(mockPrisma);
  });

  describe('createPurchaseOrder', () => {
    it('creates purchase order in DRAFT status with exact financial calculations', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue(sampleSupplier);
      mockPrisma.store.findFirst.mockResolvedValue(sampleStore);
      mockPrisma.productVariant.findUnique.mockResolvedValue(sampleVariant);
      mockPrisma.supplierProduct.findUnique.mockResolvedValue(sampleSupplierProduct);
      mockPrisma.purchaseOrder.create.mockResolvedValue(samplePo);
      mockPrisma.purchaseOrderStatusHistory.create.mockResolvedValue({});

      const result = await poService.createPurchaseOrder(
        {
          supplierId,
          destinationStoreId: storeId,
          shippingTotal: '50.00',
          items: [
            {
              variantId,
              quantityOrdered: '10.0000',
              unitPrice: '40.00',
              taxRate: '0.0500',
            },
          ],
        },
        creatorId
      );

      expect(result.id).toBe(poId);
      expect(result.status).toBe('DRAFT');
      expect(result.subtotal).toBe('400.00');
      expect(result.taxTotal).toBe('20.00');
      expect(result.grandTotal).toBe('470.00');
      expect(result.items?.[0].quantityOutstanding).toBe('10.0000');
    });

    it('uses agreed supplier product price when unitPrice is not specified', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue(sampleSupplier);
      mockPrisma.store.findFirst.mockResolvedValue(sampleStore);
      mockPrisma.productVariant.findUnique.mockResolvedValue(sampleVariant);
      mockPrisma.supplierProduct.findUnique.mockResolvedValue(sampleSupplierProduct);
      mockPrisma.purchaseOrder.create.mockResolvedValue(samplePo);
      mockPrisma.purchaseOrderStatusHistory.create.mockResolvedValue({});

      const result = await poService.createPurchaseOrder(
        {
          supplierId,
          destinationStoreId: storeId,
          items: [{ variantId, quantityOrdered: '10.0000' }],
        },
        creatorId
      );

      expect(result.id).toBe(poId);
    });

    it('rejects order creation if supplier is inactive', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue({
        ...sampleSupplier,
        status: 'INACTIVE',
      });

      await expect(
        poService.createPurchaseOrder({
          supplierId,
          destinationStoreId: storeId,
          items: [{ variantId, quantityOrdered: '5.0000' }],
        })
      ).rejects.toThrow(InactiveSupplierForOrderError);
    });

    it('rejects order creation with empty items list', async () => {
      mockPrisma.supplier.findFirst.mockResolvedValue(sampleSupplier);
      mockPrisma.store.findFirst.mockResolvedValue(sampleStore);

      await expect(
        poService.createPurchaseOrder({
          supplierId,
          destinationStoreId: storeId,
          items: [],
        })
      ).rejects.toThrow(EmptyPurchaseOrderItemsError);
    });
  });

  describe('updatePurchaseOrder', () => {
    it('updates DRAFT purchase order successfully', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue(samplePo);
      mockPrisma.purchaseOrder.update.mockResolvedValue({
        ...samplePo,
        notes: 'Updated restock notes',
      });

      const result = await poService.updatePurchaseOrder(poId, {
        notes: 'Updated restock notes',
      });

      expect(result.notes).toBe('Updated restock notes');
    });

    it('rejects update if purchase order is not in DRAFT status', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        ...samplePo,
        status: 'ORDERED',
      });

      await expect(
        poService.updatePurchaseOrder(poId, { notes: 'Attempted edit' })
      ).rejects.toThrow(PurchaseOrderImmutableError);
    });
  });

  describe('submitForApproval', () => {
    it('transitions DRAFT to PENDING_APPROVAL', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue(samplePo);
      mockPrisma.purchaseOrder.update.mockResolvedValue({
        ...samplePo,
        status: 'PENDING_APPROVAL',
      });
      mockPrisma.purchaseOrderStatusHistory.create.mockResolvedValue({});

      const result = await poService.submitForApproval(poId, creatorId);

      expect(result.status).toBe('PENDING_APPROVAL');
      expect(mockPrisma.purchaseOrderStatusHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            fromStatus: 'DRAFT',
            toStatus: 'PENDING_APPROVAL',
          }),
        })
      );
    });

    it('rejects submission if order is already APPROVED', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        ...samplePo,
        status: 'APPROVED',
      });

      await expect(poService.submitForApproval(poId, creatorId)).rejects.toThrow(
        InvalidPurchaseOrderStateError
      );
    });
  });

  describe('approvePurchaseOrder & separation of duties', () => {
    it('approves purchase order when creator and approver are different users', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        ...samplePo,
        status: 'PENDING_APPROVAL',
      });
      mockPrisma.purchaseOrder.update.mockResolvedValue({
        ...samplePo,
        status: 'APPROVED',
        approvedByUserId: approverId,
        approvedAt: mockDate,
      });
      mockPrisma.purchaseOrderStatusHistory.create.mockResolvedValue({});

      const result = await poService.approvePurchaseOrder(
        poId,
        { notes: 'Approved for procurement' },
        approverId,
        ['STORE_MANAGER']
      );

      expect(result.status).toBe('APPROVED');
      expect(result.approvedByUserId).toBe(approverId);
    });

    it('throws SeparationOfDutiesError when creator attempts self-approval', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        ...samplePo,
        status: 'PENDING_APPROVAL',
        createdByUserId: creatorId,
      });

      await expect(
        poService.approvePurchaseOrder(
          poId,
          {},
          creatorId, // Same as createdByUserId
          ['STORE_MANAGER']
        )
      ).rejects.toThrow(SeparationOfDutiesError);
    });

    it('allows self-approval if user has SUPER_ADMIN role', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        ...samplePo,
        status: 'PENDING_APPROVAL',
        createdByUserId: creatorId,
      });
      mockPrisma.purchaseOrder.update.mockResolvedValue({
        ...samplePo,
        status: 'APPROVED',
        approvedByUserId: creatorId,
      });
      mockPrisma.purchaseOrderStatusHistory.create.mockResolvedValue({});

      const result = await poService.approvePurchaseOrder(
        poId,
        {},
        creatorId,
        ['SUPER_ADMIN'] // Super admin override
      );

      expect(result.status).toBe('APPROVED');
    });
  });

  describe('markOrdered', () => {
    it('transitions APPROVED to ORDERED with timestamp', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        ...samplePo,
        status: 'APPROVED',
      });
      mockPrisma.purchaseOrder.update.mockResolvedValue({
        ...samplePo,
        status: 'ORDERED',
        orderedAt: mockDate,
      });
      mockPrisma.purchaseOrderStatusHistory.create.mockResolvedValue({});

      const result = await poService.markOrdered(poId, approverId);

      expect(result.status).toBe('ORDERED');
      expect(mockPrisma.purchaseOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'ORDERED' }),
        })
      );
    });
  });

  describe('cancelPurchaseOrder', () => {
    it('cancels unreceived purchase order with reason recorded', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        ...samplePo,
        status: 'ORDERED',
      });
      mockPrisma.purchaseOrder.update.mockResolvedValue({
        ...samplePo,
        status: 'CANCELLED',
        cancelledAt: mockDate,
      });
      mockPrisma.purchaseOrderStatusHistory.create.mockResolvedValue({});

      const result = await poService.cancelPurchaseOrder(
        poId,
        { reason: 'Supplier out of raw materials' },
        approverId
      );

      expect(result.status).toBe('CANCELLED');
    });

    it('rejects cancellation if delivery has already started', async () => {
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        ...samplePo,
        status: 'PARTIALLY_RECEIVED',
        items: [
          {
            ...samplePo.items[0],
            quantityReceived: new Prisma.Decimal('5.0000'),
          },
        ],
      });

      await expect(
        poService.cancelPurchaseOrder(poId, { reason: 'Late delivery' }, approverId)
      ).rejects.toThrow(InvalidPurchaseOrderStateError);
    });
  });
});
