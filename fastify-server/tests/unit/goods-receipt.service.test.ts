import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { GoodsReceiptService } from '../../src/modules/procurement/goods-receipt.service.js';
import {
  DuplicateReceiptIdempotencyError,
  InvalidPurchaseOrderStateError,
  InvalidReceivedQuantityError,
} from '../../src/modules/procurement/procurement.errors.js';
import { BadRequestError } from '../../src/common/errors/app-error.js';

describe('GoodsReceiptService (Unit)', () => {
  let mockPrisma: any;
  let receiptService: GoodsReceiptService;

  const poId = '11111111-1111-4111-a111-111111111111';
  const storeId = '22222222-2222-4222-a222-222222222222';
  const variantId = '33333333-3333-4333-a333-333333333333';
  const poItemId = '44444444-4444-4444-a444-444444444444';
  const userId = '55555555-5555-4555-a555-555555555555';
  const receiptId = '66666666-6666-4666-a666-666666666666';
  const balanceId = '77777777-7777-4777-a777-777777777777';
  const mockDate = new Date('2026-10-23T14:00:00Z');

  const samplePoItem = {
    id: poItemId,
    purchaseOrderId: poId,
    variantId,
    skuSnapshot: 'WHEEL-18',
    productNameSnapshot: 'Alloy Wheel 18-inch',
    quantityOrdered: new Prisma.Decimal('100.0000'),
    quantityReceived: new Prisma.Decimal('0.0000'),
    unitPrice: new Prisma.Decimal('80.00'),
    discountAmount: new Prisma.Decimal('0.00'),
    taxRate: new Prisma.Decimal('0.0000'),
    lineTotal: new Prisma.Decimal('8000.00'),
  };

  const samplePo = {
    id: poId,
    purchaseOrderNumber: 'PO-20261023-1001',
    destinationStoreId: storeId,
    status: 'ORDERED' as const,
    items: [samplePoItem],
  };

  const sampleReceipt = {
    id: receiptId,
    receiptNumber: 'GR-20261023-1001',
    purchaseOrderId: poId,
    destinationStoreId: storeId,
    status: 'COMPLETED' as const,
    receivedByUserId: userId,
    receivedAt: mockDate,
    deliveryReference: 'BOL-998877',
    notes: 'Partial shipment delivered via freight',
    idempotencyKey: 'idem-gr-01',
    createdAt: mockDate,
    updatedAt: mockDate,
    items: [
      {
        id: 'gr-item-1',
        goodsReceiptId: receiptId,
        purchaseOrderItemId: poItemId,
        variantId,
        quantityDelivered: new Prisma.Decimal('60.0000'),
        quantityAccepted: new Prisma.Decimal('58.0000'),
        quantityRejected: new Prisma.Decimal('2.0000'),
        rejectionReason: 'Damaged rims',
        createdAt: mockDate,
      },
    ],
    purchaseOrder: {
      id: poId,
      purchaseOrderNumber: 'PO-20261023-1001',
      status: 'PARTIALLY_RECEIVED',
    },
  };

  beforeEach(() => {
    mockPrisma = {
      purchaseOrder: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      purchaseOrderItem: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      goodsReceipt: {
        findUnique: vi.fn(),
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      goodsReceiptItem: {
        createMany: vi.fn(),
      },
      inventoryBalance: {
        upsert: vi.fn(),
        update: vi.fn(),
        findUnique: vi.fn(),
      },
      inventoryMovement: {
        create: vi.fn(),
      },
      purchaseOrderStatusHistory: {
        create: vi.fn(),
      },
      $transaction: vi.fn((callback: any) => callback(mockPrisma)),
      $queryRaw: vi.fn().mockImplementation((query: any) => {
        const text = query.strings ? query.strings.join(' ') : String(query);
        if (text.includes('purchase_order_num_seq') || text.includes('goods_receipt_num_seq')) {
          return Promise.resolve([{ nextval: 1001 }]);
        }
        if (text.includes('FROM purchase_orders') && text.includes('FOR UPDATE')) {
          return Promise.resolve([
            {
              id: poId,
              purchase_order_number: 'PO-20261023-1001',
              destination_store_id: storeId,
              status: 'ORDERED',
            },
          ]);
        }
        if (text.includes('FROM inventory_balances') && text.includes('FOR UPDATE')) {
          return Promise.resolve([
            {
              id: balanceId,
              store_id: storeId,
              variant_id: variantId,
              quantity_on_hand: new Prisma.Decimal('20.0000'),
              quantity_reserved: new Prisma.Decimal('0.0000'),
              reorder_level: new Prisma.Decimal('5.0000'),
            },
          ]);
        }
        return Promise.resolve([]);
      }),
    };

    receiptService = new GoodsReceiptService(mockPrisma);
  });

  describe('receiveGoods', () => {
    it('processes partial delivery, updates PO item received count, and increments inventory balance', async () => {
      mockPrisma.goodsReceipt.findUnique.mockResolvedValue(null);
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue(samplePo);
      mockPrisma.purchaseOrderItem.update.mockResolvedValue({});
      mockPrisma.inventoryBalance.upsert.mockResolvedValue({});
      mockPrisma.inventoryMovement.create.mockResolvedValue({});
      mockPrisma.inventoryBalance.update.mockResolvedValue({});
      mockPrisma.goodsReceipt.create.mockResolvedValue(sampleReceipt);

      // After update, 58 received out of 100 -> partial
      mockPrisma.purchaseOrderItem.findMany.mockResolvedValue([
        {
          ...samplePoItem,
          quantityOrdered: new Prisma.Decimal('100.0000'),
          quantityReceived: new Prisma.Decimal('58.0000'),
        },
      ]);
      mockPrisma.purchaseOrder.update.mockResolvedValue({});
      mockPrisma.purchaseOrderStatusHistory.create.mockResolvedValue({});

      const result = await receiptService.receiveGoods(
        poId,
        {
          deliveryReference: 'BOL-998877',
          notes: 'Partial shipment delivered via freight',
          items: [
            {
              purchaseOrderItemId: poItemId,
              quantityDelivered: '60.0000',
              quantityAccepted: '58.0000',
              quantityRejected: '2.0000',
              rejectionReason: 'Damaged rims',
            },
          ],
        },
        userId
      );

      expect(result.id).toBe(receiptId);
      expect(result.receiptNumber).toBe('GR-20261023-1001');

      // Verify PO item increment was called with accepted quantity
      expect(mockPrisma.purchaseOrderItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: poItemId },
          data: { quantityReceived: { increment: new Prisma.Decimal('58.0000') } },
        })
      );

      // Verify inventory movement was logged
      expect(mockPrisma.inventoryMovement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            movementType: 'STOCK_RECEIVED',
            quantityDelta: new Prisma.Decimal('58.0000'),
            quantityBefore: new Prisma.Decimal('20.0000'),
            quantityAfter: new Prisma.Decimal('78.0000'),
            referenceType: 'PURCHASE_ORDER',
          }),
        })
      );

      // Verify inventory balance was updated to 78.0000
      expect(mockPrisma.inventoryBalance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: balanceId },
          data: { quantityOnHand: new Prisma.Decimal('78.0000') },
        })
      );

      // Verify PO status transitioned to PARTIALLY_RECEIVED
      expect(mockPrisma.purchaseOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: poId },
          data: { status: 'PARTIALLY_RECEIVED' },
        })
      );
    });

    it('transitions purchase order to RECEIVED when all items are fully received', async () => {
      mockPrisma.goodsReceipt.findUnique.mockResolvedValue(null);
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue(samplePo);
      mockPrisma.purchaseOrderItem.update.mockResolvedValue({});
      mockPrisma.inventoryBalance.upsert.mockResolvedValue({});
      mockPrisma.inventoryMovement.create.mockResolvedValue({});
      mockPrisma.inventoryBalance.update.mockResolvedValue({});
      mockPrisma.goodsReceipt.create.mockResolvedValue({
        ...sampleReceipt,
        purchaseOrder: { ...sampleReceipt.purchaseOrder, status: 'RECEIVED' },
      });

      // 100 received out of 100 -> complete
      mockPrisma.purchaseOrderItem.findMany.mockResolvedValue([
        {
          ...samplePoItem,
          quantityOrdered: new Prisma.Decimal('100.0000'),
          quantityReceived: new Prisma.Decimal('100.0000'),
        },
      ]);
      mockPrisma.purchaseOrder.update.mockResolvedValue({});
      mockPrisma.purchaseOrderStatusHistory.create.mockResolvedValue({});

      await receiptService.receiveGoods(
        poId,
        {
          items: [
            {
              purchaseOrderItemId: poItemId,
              quantityDelivered: '100.0000',
              quantityAccepted: '100.0000',
              quantityRejected: '0.0000',
            },
          ],
        },
        userId
      );

      expect(mockPrisma.purchaseOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: poId },
          data: { status: 'RECEIVED' },
        })
      );
    });

    it('replays previously created receipt when idempotent key is repeated', async () => {
      mockPrisma.goodsReceipt.findUnique.mockResolvedValue(sampleReceipt);

      const result = await receiptService.receiveGoods(
        poId,
        {
          idempotencyKey: 'idem-gr-01',
          items: [
            {
              purchaseOrderItemId: poItemId,
              quantityDelivered: '60.0000',
              quantityAccepted: '58.0000',
            },
          ],
        },
        userId
      );

      expect(result.id).toBe(receiptId);
      // Ensures transaction was not executed again
      expect(mockPrisma.goodsReceipt.create).not.toHaveBeenCalled();
    });

    it('throws DuplicateReceiptIdempotencyError if idempotency key used for different order', async () => {
      mockPrisma.goodsReceipt.findUnique.mockResolvedValue({
        ...sampleReceipt,
        purchaseOrderId: 'different-po-id',
      });

      await expect(
        receiptService.receiveGoods(
          poId,
          {
            idempotencyKey: 'idem-gr-01',
            items: [
              {
                purchaseOrderItemId: poItemId,
                quantityDelivered: '60.0000',
                quantityAccepted: '58.0000',
              },
            ],
          },
          userId
        )
      ).rejects.toThrow(DuplicateReceiptIdempotencyError);
    });

    it('rejects delivery if accepted plus rejected does not match delivered quantity', async () => {
      mockPrisma.goodsReceipt.findUnique.mockResolvedValue(null);
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue(samplePo);

      await expect(
        receiptService.receiveGoods(
          poId,
          {
            items: [
              {
                purchaseOrderItemId: poItemId,
                quantityDelivered: '50.0000',
                quantityAccepted: '40.0000',
                quantityRejected: '5.0000', // 40 + 5 = 45 != 50
              },
            ],
          },
          userId
        )
      ).rejects.toThrow(InvalidReceivedQuantityError);
    });

    it('rejects delivery if accepted quantity exceeds remaining outstanding order quantity', async () => {
      mockPrisma.goodsReceipt.findUnique.mockResolvedValue(null);
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        ...samplePo,
        items: [
          {
            ...samplePoItem,
            quantityOrdered: new Prisma.Decimal('10.0000'),
            quantityReceived: new Prisma.Decimal('8.0000'), // Only 2 remaining outstanding
          },
        ],
      });

      await expect(
        receiptService.receiveGoods(
          poId,
          {
            items: [
              {
                purchaseOrderItemId: poItemId,
                quantityDelivered: '5.0000',
                quantityAccepted: '5.0000', // 5 exceeds 2
                quantityRejected: '0.0000',
              },
            ],
          },
          userId
        )
      ).rejects.toThrow(InvalidReceivedQuantityError);
    });

    it('rejects goods receipt if purchase order is in DRAFT state', async () => {
      mockPrisma.goodsReceipt.findUnique.mockResolvedValue(null);
      mockPrisma.purchaseOrder.findUnique.mockResolvedValue({
        ...samplePo,
        status: 'DRAFT',
      });

      await expect(
        receiptService.receiveGoods(
          poId,
          {
            items: [
              {
                purchaseOrderItemId: poItemId,
                quantityDelivered: '10.0000',
                quantityAccepted: '10.0000',
              },
            ],
          },
          userId
        )
      ).rejects.toThrow(InvalidPurchaseOrderStateError);
    });
  });
});
