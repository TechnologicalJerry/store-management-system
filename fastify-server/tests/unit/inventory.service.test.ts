import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { InventoryService } from '../../src/modules/inventory/inventory.service.js';
import type { InventoryRepository } from '../../src/modules/inventory/inventory.repository.js';
import { BadRequestError, NotFoundError } from '../../src/common/errors/app-error.js';
import { DuplicateIdempotencyKeyError, InsufficientStockError } from '../../src/modules/inventory/inventory.errors.js';

describe('InventoryService (Unit)', () => {
  let mockPrisma: any;
  let mockRepo: InventoryRepository;
  let inventoryService: InventoryService;

  const storeId = '11111111-1111-4111-a111-111111111111';
  const variantId = '22222222-2222-4222-a222-222222222222';
  const userId = '33333333-3333-4333-a333-333333333333';
  const mockDate = new Date('2026-10-22T10:00:00Z');

  const sampleBalanceRecord = {
    id: '44444444-4444-4444-a444-444444444444',
    storeId,
    variantId,
    quantityOnHand: new Prisma.Decimal('100.0000'),
    quantityReserved: new Prisma.Decimal('10.0000'),
    reorderLevel: new Prisma.Decimal('20.0000'),
    store: { id: storeId, name: 'Main Store', code: 'MAIN-01', status: 'ACTIVE' },
    variant: {
      id: variantId,
      productId: '55555555-5555-4555-a555-555555555555',
      name: 'Standard Variant',
      sku: 'SKU-001',
      barcode: '123456789012',
      price: new Prisma.Decimal('19.99'),
      product: { id: '55555555-5555-4555-a555-555555555555', name: 'Coffee Beans', slug: 'coffee-beans' },
    },
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  const sampleMovementRecord = {
    id: '66666666-6666-4666-a666-666666666666',
    storeId,
    variantId,
    movementType: 'STOCK_RECEIVED' as const,
    quantityDelta: new Prisma.Decimal('50.0000'),
    quantityBefore: new Prisma.Decimal('100.0000'),
    quantityAfter: new Prisma.Decimal('150.0000'),
    referenceType: 'STOCK_RECEIPT',
    referenceId: 'REC-001',
    idempotencyKey: 'idem-key-1',
    reason: 'Initial shipment',
    notes: 'Fragile container',
    performedByUserId: userId,
    performedByUser: { id: userId, name: 'Inventory Manager', email: 'manager@store.local' },
    createdAt: mockDate,
  };

  beforeEach(() => {
    mockRepo = {
      findBalance: vi.fn(),
      findBalanceForUpdate: vi.fn(),
      ensureBalanceExists: vi.fn(),
      updateBalance: vi.fn(),
      listBalances: vi.fn(),
      listLowStockBalances: vi.fn(),
      createMovement: vi.fn(),
      findMovementByIdempotencyKey: vi.fn(),
      listMovements: vi.fn(),
    } as unknown as InventoryRepository;

    mockPrisma = {
      store: {
        findUnique: vi.fn(),
      },
      productVariant: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
    };

    inventoryService = new InventoryService(mockPrisma, mockRepo);
  });

  describe('serializeBalance', () => {
    it('should compute derived available quantity and isLowStock flag correctly', () => {
      const result = inventoryService.serializeBalance(sampleBalanceRecord);
      expect(result.quantityOnHand).toBe('100.0000');
      expect(result.quantityReserved).toBe('10.0000');
      expect(result.quantityAvailable).toBe('90.0000'); // 100 - 10
      expect(result.reorderLevel).toBe('20.0000');
      expect(result.isLowStock).toBe(false); // 100 > 20
    });

    it('should mark isLowStock as true when on-hand is less than or equal to reorder level', () => {
      const lowStockRecord = {
        ...sampleBalanceRecord,
        quantityOnHand: new Prisma.Decimal('15.0000'),
        quantityReserved: new Prisma.Decimal('0.0000'),
        reorderLevel: new Prisma.Decimal('20.0000'),
      };
      const result = inventoryService.serializeBalance(lowStockRecord);
      expect(result.isLowStock).toBe(true);
      expect(result.quantityAvailable).toBe('15.0000');
    });
  });

  describe('receiveStock', () => {
    it('should receive stock into store inventory and record movement', async () => {
      mockPrisma.store.findUnique.mockResolvedValue({ id: storeId, status: 'ACTIVE', deletedAt: null });
      mockPrisma.productVariant.findUnique.mockResolvedValue({ id: variantId, status: 'ACTIVE' });
      vi.mocked(mockRepo.findMovementByIdempotencyKey).mockResolvedValue(null);
      vi.mocked(mockRepo.ensureBalanceExists).mockResolvedValue(sampleBalanceRecord as any);
      vi.mocked(mockRepo.findBalanceForUpdate).mockResolvedValue({
        id: sampleBalanceRecord.id,
        store_id: storeId,
        variant_id: variantId,
        quantity_on_hand: new Prisma.Decimal('100.0000'),
        quantity_reserved: new Prisma.Decimal('10.0000'),
        reorder_level: new Prisma.Decimal('20.0000'),
      });
      vi.mocked(mockRepo.createMovement).mockResolvedValue(sampleMovementRecord as any);
      vi.mocked(mockRepo.updateBalance).mockResolvedValue({
        ...sampleBalanceRecord,
        quantityOnHand: new Prisma.Decimal('150.0000'),
      } as any);

      const result = await inventoryService.receiveStock(
        storeId,
        {
          variantId,
          quantity: 50,
          reason: 'Initial shipment',
          idempotencyKey: 'idem-key-1',
        },
        userId
      );

      expect(result.balance.quantityOnHand).toBe('150.0000');
      expect(result.movement.movementType).toBe('STOCK_RECEIVED');
      expect(mockRepo.createMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId,
          variantId,
          quantityDelta: expect.any(Prisma.Decimal),
          movementType: 'STOCK_RECEIVED',
        }),
        expect.anything()
      );
    });

    it('should reject receipt when store is inactive', async () => {
      mockPrisma.store.findUnique.mockResolvedValue({ id: storeId, status: 'SUSPENDED', deletedAt: null });
      await expect(
        inventoryService.receiveStock(storeId, { variantId, quantity: 10 })
      ).rejects.toThrow(BadRequestError);
    });

    it('should reject receipt with zero or negative quantity', async () => {
      await expect(
        inventoryService.receiveStock(storeId, { variantId, quantity: 0 })
      ).rejects.toThrow(BadRequestError);
      await expect(
        inventoryService.receiveStock(storeId, { variantId, quantity: -5 })
      ).rejects.toThrow(BadRequestError);
    });

    it('should return existing result when same idempotency key is retried with identical parameters', async () => {
      mockPrisma.store.findUnique.mockResolvedValue({ id: storeId, status: 'ACTIVE', deletedAt: null });
      mockPrisma.productVariant.findUnique.mockResolvedValue({ id: variantId, status: 'ACTIVE' });
      vi.mocked(mockRepo.findMovementByIdempotencyKey).mockResolvedValue(sampleMovementRecord as any);
      vi.mocked(mockRepo.findBalance).mockResolvedValue({
        ...sampleBalanceRecord,
        quantityOnHand: new Prisma.Decimal('150.0000'),
      } as any);

      const result = await inventoryService.receiveStock(
        storeId,
        {
          variantId,
          quantity: 50,
          idempotencyKey: 'idem-key-1',
        },
        userId
      );

      expect(result.movement.id).toBe(sampleMovementRecord.id);
      expect(mockRepo.createMovement).not.toHaveBeenCalled();
    });

    it('should reject request when idempotency key is reused with different quantity', async () => {
      mockPrisma.store.findUnique.mockResolvedValue({ id: storeId, status: 'ACTIVE', deletedAt: null });
      mockPrisma.productVariant.findUnique.mockResolvedValue({ id: variantId, status: 'ACTIVE' });
      vi.mocked(mockRepo.findMovementByIdempotencyKey).mockResolvedValue(sampleMovementRecord as any);

      await expect(
        inventoryService.receiveStock(
          storeId,
          {
            variantId,
            quantity: 75, // Different quantity
            idempotencyKey: 'idem-key-1',
          },
          userId
        )
      ).rejects.toThrow(DuplicateIdempotencyKeyError);
    });
  });

  describe('adjustStock', () => {
    it('should increase stock on positive adjustment', async () => {
      mockPrisma.store.findUnique.mockResolvedValue({ id: storeId, status: 'ACTIVE', deletedAt: null });
      mockPrisma.productVariant.findUnique.mockResolvedValue({ id: variantId, status: 'ACTIVE' });
      vi.mocked(mockRepo.findMovementByIdempotencyKey).mockResolvedValue(null);
      vi.mocked(mockRepo.ensureBalanceExists).mockResolvedValue(sampleBalanceRecord as any);
      vi.mocked(mockRepo.findBalanceForUpdate).mockResolvedValue({
        id: sampleBalanceRecord.id,
        store_id: storeId,
        variant_id: variantId,
        quantity_on_hand: new Prisma.Decimal('100.0000'),
        quantity_reserved: new Prisma.Decimal('10.0000'),
        reorder_level: new Prisma.Decimal('20.0000'),
      });
      vi.mocked(mockRepo.createMovement).mockResolvedValue({
        ...sampleMovementRecord,
        movementType: 'ADJUSTMENT_INCREASE',
      } as any);
      vi.mocked(mockRepo.updateBalance).mockResolvedValue({
        ...sampleBalanceRecord,
        quantityOnHand: new Prisma.Decimal('120.0000'),
      } as any);

      const result = await inventoryService.adjustStock(
        storeId,
        {
          variantId,
          adjustmentType: 'INCREASE',
          quantity: 20,
          reason: 'Found extra inventory during recount',
        },
        userId
      );

      expect(result.balance.quantityOnHand).toBe('120.0000');
    });

    it('should decrease stock on valid negative adjustment', async () => {
      mockPrisma.store.findUnique.mockResolvedValue({ id: storeId, status: 'ACTIVE', deletedAt: null });
      mockPrisma.productVariant.findUnique.mockResolvedValue({ id: variantId, status: 'ACTIVE' });
      vi.mocked(mockRepo.findMovementByIdempotencyKey).mockResolvedValue(null);
      vi.mocked(mockRepo.ensureBalanceExists).mockResolvedValue(sampleBalanceRecord as any);
      vi.mocked(mockRepo.findBalanceForUpdate).mockResolvedValue({
        id: sampleBalanceRecord.id,
        store_id: storeId,
        variant_id: variantId,
        quantity_on_hand: new Prisma.Decimal('100.0000'),
        quantity_reserved: new Prisma.Decimal('10.0000'),
        reorder_level: new Prisma.Decimal('20.0000'),
      });
      vi.mocked(mockRepo.createMovement).mockResolvedValue({
        ...sampleMovementRecord,
        movementType: 'ADJUSTMENT_DECREASE',
      } as any);
      vi.mocked(mockRepo.updateBalance).mockResolvedValue({
        ...sampleBalanceRecord,
        quantityOnHand: new Prisma.Decimal('70.0000'),
      } as any);

      const result = await inventoryService.adjustStock(
        storeId,
        {
          variantId,
          adjustmentType: 'DECREASE',
          quantity: 30,
          reason: 'Damaged packaging write-off',
        },
        userId
      );

      expect(result.balance.quantityOnHand).toBe('70.0000');
    });

    it('should reject adjustment decrease exceeding available stock (violating reserved invariant)', async () => {
      mockPrisma.store.findUnique.mockResolvedValue({ id: storeId, status: 'ACTIVE', deletedAt: null });
      mockPrisma.productVariant.findUnique.mockResolvedValue({ id: variantId, status: 'ACTIVE' });
      vi.mocked(mockRepo.findMovementByIdempotencyKey).mockResolvedValue(null);
      vi.mocked(mockRepo.ensureBalanceExists).mockResolvedValue(sampleBalanceRecord as any);
      vi.mocked(mockRepo.findBalanceForUpdate).mockResolvedValue({
        id: sampleBalanceRecord.id,
        store_id: storeId,
        variant_id: variantId,
        quantity_on_hand: new Prisma.Decimal('100.0000'),
        quantity_reserved: new Prisma.Decimal('20.0000'), // 80 available
        reorder_level: new Prisma.Decimal('10.0000'),
      });

      await expect(
        inventoryService.adjustStock(
          storeId,
          {
            variantId,
            adjustmentType: 'DECREASE',
            quantity: 90, // Would leave only 10 on hand, less than 20 reserved!
            reason: 'Excessive decrease',
          },
          userId
        )
      ).rejects.toThrow(InsufficientStockError);
    });

    it('should reject adjustment with missing reason', async () => {
      mockPrisma.store.findUnique.mockResolvedValue({ id: storeId, status: 'ACTIVE', deletedAt: null });
      mockPrisma.productVariant.findUnique.mockResolvedValue({ id: variantId, status: 'ACTIVE' });

      await expect(
        inventoryService.adjustStock(
          storeId,
          {
            variantId,
            adjustmentType: 'INCREASE',
            quantity: 10,
            reason: '   ',
          },
          userId
        )
      ).rejects.toThrow(BadRequestError);
    });
  });
});
