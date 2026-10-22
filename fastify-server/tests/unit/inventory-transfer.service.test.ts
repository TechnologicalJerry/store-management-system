import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { InventoryTransferService } from '../../src/modules/inventory/inventory-transfer.service.js';
import type { InventoryRepository } from '../../src/modules/inventory/inventory.repository.js';
import { BadRequestError, NotFoundError } from '../../src/common/errors/app-error.js';
import { InsufficientStockError, InvalidTransferStateError } from '../../src/modules/inventory/inventory.errors.js';

describe('InventoryTransferService (Unit)', () => {
  let mockPrisma: any;
  let mockRepo: InventoryRepository;
  let transferService: InventoryTransferService;

  const sourceStoreId = '11111111-1111-4111-a111-111111111111';
  const destStoreId = '22222222-2222-4222-a222-222222222222';
  const variantId = '33333333-3333-4333-a333-333333333333';
  const userId = '44444444-4444-4444-a444-444444444444';
  const transferId = '55555555-5555-4555-a555-555555555555';
  const mockDate = new Date('2026-10-22T10:00:00Z');

  const sampleTransfer = {
    id: transferId,
    transferNumber: 'TRF-20261022-0001',
    sourceStoreId,
    destinationStoreId: destStoreId,
    status: 'DRAFT' as const,
    notes: 'Weekly store restock',
    sourceStore: { id: sourceStoreId, name: 'Warehouse Hub', code: 'WH-01', status: 'ACTIVE' },
    destinationStore: { id: destStoreId, name: 'Downtown Branch', code: 'DT-01', status: 'ACTIVE' },
    items: [
      {
        id: 'item-1',
        transferId,
        variantId,
        quantityRequested: new Prisma.Decimal('50.0000'),
        quantityShipped: new Prisma.Decimal('0.0000'),
        quantityReceived: new Prisma.Decimal('0.0000'),
        notes: null,
        variant: {
          id: variantId,
          productId: 'prod-1',
          name: 'Variant 1',
          sku: 'SKU-001',
          barcode: '123',
        },
        createdAt: mockDate,
        updatedAt: mockDate,
      },
    ],
    createdByUserId: userId,
    approvedByUserId: null,
    shippedByUserId: null,
    receivedByUserId: null,
    shippedAt: null,
    receivedAt: null,
    cancelledAt: null,
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  beforeEach(() => {
    mockRepo = {
      createTransfer: vi.fn(),
      findTransferById: vi.fn(),
      updateTransfer: vi.fn(),
      updateTransferItem: vi.fn(),
      listTransfers: vi.fn(),
      findBalanceForUpdate: vi.fn(),
      updateBalance: vi.fn(),
      createMovement: vi.fn(),
      ensureBalanceExists: vi.fn(),
    } as unknown as InventoryRepository;

    mockPrisma = {
      store: { findUnique: vi.fn() },
      productVariant: { findMany: vi.fn() },
      inventoryTransfer: { update: vi.fn() },
      $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
    };

    transferService = new InventoryTransferService(mockPrisma, mockRepo);
  });

  describe('createTransfer', () => {
    it('should create an inter-store transfer in DRAFT status', async () => {
      mockPrisma.store.findUnique
        .mockResolvedValueOnce({ id: sourceStoreId, status: 'ACTIVE', deletedAt: null })
        .mockResolvedValueOnce({ id: destStoreId, status: 'ACTIVE', deletedAt: null });

      mockPrisma.productVariant.findMany.mockResolvedValue([{ id: variantId }]);
      vi.mocked(mockRepo.createTransfer).mockResolvedValue(sampleTransfer as any);

      const result = await transferService.createTransfer(
        {
          sourceStoreId,
          destinationStoreId: destStoreId,
          notes: 'Weekly store restock',
          items: [{ variantId, quantityRequested: 50 }],
        },
        userId
      );

      expect(result.status).toBe('DRAFT');
      expect(result.items.length).toBe(1);
      expect(mockRepo.createTransfer).toHaveBeenCalled();
    });

    it('should reject transfer when source and destination stores are identical', async () => {
      await expect(
        transferService.createTransfer(
          {
            sourceStoreId,
            destinationStoreId: sourceStoreId, // Same store
            items: [{ variantId, quantityRequested: 50 }],
          },
          userId
        )
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('transfer state machine', () => {
    it('should submit a DRAFT transfer to REQUESTED', async () => {
      vi.mocked(mockRepo.findTransferById).mockResolvedValue(sampleTransfer as any);
      vi.mocked(mockRepo.updateTransfer).mockResolvedValue({
        ...sampleTransfer,
        status: 'REQUESTED',
      } as any);

      const result = await transferService.submitTransfer(transferId);
      expect(result.status).toBe('REQUESTED');
      expect(mockRepo.updateTransfer).toHaveBeenCalledWith(transferId, { status: 'REQUESTED' });
    });

    it('should reject submitting a transfer that is not in DRAFT status', async () => {
      vi.mocked(mockRepo.findTransferById).mockResolvedValue({
        ...sampleTransfer,
        status: 'SHIPPED',
      } as any);

      await expect(transferService.submitTransfer(transferId)).rejects.toThrow(InvalidTransferStateError);
    });

    it('should approve a REQUESTED transfer', async () => {
      vi.mocked(mockRepo.findTransferById).mockResolvedValue({
        ...sampleTransfer,
        status: 'REQUESTED',
      } as any);
      vi.mocked(mockRepo.updateTransfer).mockResolvedValue({
        ...sampleTransfer,
        status: 'APPROVED',
        approvedByUserId: userId,
      } as any);

      const result = await transferService.approveTransfer(transferId, userId);
      expect(result.status).toBe('APPROVED');
    });

    it('should ship an APPROVED transfer, deduct source stock, and record TRANSFER_OUT movement', async () => {
      vi.mocked(mockRepo.findTransferById).mockResolvedValue({
        ...sampleTransfer,
        status: 'APPROVED',
      } as any);

      vi.mocked(mockRepo.findBalanceForUpdate).mockResolvedValue({
        id: 'bal-1',
        store_id: sourceStoreId,
        variant_id: variantId,
        quantity_on_hand: new Prisma.Decimal('100.0000'),
        quantity_reserved: new Prisma.Decimal('0.0000'),
        reorder_level: new Prisma.Decimal('10.0000'),
      });

      mockPrisma.inventoryTransfer.update.mockResolvedValue({
        ...sampleTransfer,
        status: 'SHIPPED',
        shippedAt: new Date(),
        items: [
          {
            ...sampleTransfer.items[0],
            quantityShipped: new Prisma.Decimal('50.0000'),
          },
        ],
      });

      const result = await transferService.shipTransfer(transferId, undefined, userId);

      expect(result.status).toBe('SHIPPED');
      expect(mockRepo.findBalanceForUpdate).toHaveBeenCalledWith(sourceStoreId, variantId, expect.anything());
      expect(mockRepo.updateBalance).toHaveBeenCalledWith(
        'bal-1',
        { quantityOnHand: new Prisma.Decimal('50.0000') },
        expect.anything()
      );
      expect(mockRepo.createMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: sourceStoreId,
          variantId,
          movementType: 'TRANSFER_OUT',
          quantityDelta: expect.any(Prisma.Decimal),
        }),
        expect.anything()
      );
    });

    it('should reject shipping when source store has insufficient available stock', async () => {
      vi.mocked(mockRepo.findTransferById).mockResolvedValue({
        ...sampleTransfer,
        status: 'APPROVED',
      } as any);

      vi.mocked(mockRepo.findBalanceForUpdate).mockResolvedValue({
        id: 'bal-1',
        store_id: sourceStoreId,
        variant_id: variantId,
        quantity_on_hand: new Prisma.Decimal('30.0000'), // Only 30 available, but 50 requested!
        quantity_reserved: new Prisma.Decimal('0.0000'),
        reorder_level: new Prisma.Decimal('10.0000'),
      });

      await expect(transferService.shipTransfer(transferId, undefined, userId)).rejects.toThrow(
        InsufficientStockError
      );
    });

    it('should receive transfer at destination store and credit stock', async () => {
      const shippedTransfer = {
        ...sampleTransfer,
        status: 'SHIPPED',
        items: [
          {
            ...sampleTransfer.items[0],
            quantityShipped: new Prisma.Decimal('50.0000'),
          },
        ],
      };

      vi.mocked(mockRepo.findTransferById).mockResolvedValue(shippedTransfer as any);
      vi.mocked(mockRepo.findBalanceForUpdate).mockResolvedValue({
        id: 'dest-bal-1',
        store_id: destStoreId,
        variant_id: variantId,
        quantity_on_hand: new Prisma.Decimal('10.0000'),
        quantity_reserved: new Prisma.Decimal('0.0000'),
        reorder_level: new Prisma.Decimal('5.0000'),
      });

      mockPrisma.inventoryTransfer.update.mockResolvedValue({
        ...shippedTransfer,
        status: 'RECEIVED',
        receivedAt: new Date(),
        items: [
          {
            ...shippedTransfer.items[0],
            quantityReceived: new Prisma.Decimal('50.0000'),
          },
        ],
      });

      const result = await transferService.receiveTransfer(transferId, undefined, userId);

      expect(result.status).toBe('RECEIVED');
      expect(mockRepo.updateBalance).toHaveBeenCalledWith(
        'dest-bal-1',
        { quantityOnHand: new Prisma.Decimal('60.0000') },
        expect.anything()
      );
      expect(mockRepo.createMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: destStoreId,
          variantId,
          movementType: 'TRANSFER_IN',
        }),
        expect.anything()
      );
    });

    it('should mark transfer as PARTIALLY_RECEIVED when received quantity is less than shipped quantity', async () => {
      const shippedTransfer = {
        ...sampleTransfer,
        status: 'SHIPPED',
        items: [
          {
            ...sampleTransfer.items[0],
            quantityShipped: new Prisma.Decimal('50.0000'),
          },
        ],
      };

      vi.mocked(mockRepo.findTransferById).mockResolvedValue(shippedTransfer as any);
      vi.mocked(mockRepo.findBalanceForUpdate).mockResolvedValue({
        id: 'dest-bal-1',
        store_id: destStoreId,
        variant_id: variantId,
        quantity_on_hand: new Prisma.Decimal('10.0000'),
        quantity_reserved: new Prisma.Decimal('0.0000'),
        reorder_level: new Prisma.Decimal('5.0000'),
      });

      mockPrisma.inventoryTransfer.update.mockResolvedValue({
        ...shippedTransfer,
        status: 'PARTIALLY_RECEIVED',
        items: [
          {
            ...shippedTransfer.items[0],
            quantityReceived: new Prisma.Decimal('45.0000'), // 5 lost or damaged
          },
        ],
      });

      const result = await transferService.receiveTransfer(
        transferId,
        {
          items: [{ variantId, quantityReceived: 45, notes: '5 units damaged in transit' }],
        },
        userId
      );

      expect(result.status).toBe('PARTIALLY_RECEIVED');
    });

    it('should reject cancelling a transfer that has already shipped', async () => {
      vi.mocked(mockRepo.findTransferById).mockResolvedValue({
        ...sampleTransfer,
        status: 'SHIPPED',
      } as any);

      await expect(transferService.cancelTransfer(transferId, userId)).rejects.toThrow(
        InvalidTransferStateError
      );
    });
  });
});
