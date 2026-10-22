import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { InventoryMovementService } from '../../src/modules/inventory/inventory-movement.service.js';
import type { InventoryRepository } from '../../src/modules/inventory/inventory.repository.js';

describe('InventoryMovementService (Unit)', () => {
  let mockPrisma: any;
  let mockRepo: InventoryRepository;
  let movementService: InventoryMovementService;

  const storeId = '11111111-1111-4111-a111-111111111111';
  const variantId = '22222222-2222-4222-a222-222222222222';
  const mockDate = new Date('2026-10-22T10:00:00Z');

  const sampleMovement = {
    id: 'mov-1',
    storeId,
    variantId,
    movementType: 'STOCK_RECEIVED' as const,
    quantityDelta: new Prisma.Decimal('25.0000'),
    quantityBefore: new Prisma.Decimal('50.0000'),
    quantityAfter: new Prisma.Decimal('75.0000'),
    referenceType: 'STOCK_RECEIPT',
    referenceId: 'REC-123',
    idempotencyKey: 'idem-1',
    reason: 'Regular restock',
    notes: null,
    performedByUserId: 'user-1',
    performedByUser: { id: 'user-1', name: 'John Doe', email: 'john@store.local' },
    createdAt: mockDate,
  };

  beforeEach(() => {
    mockRepo = {
      listMovements: vi.fn(),
    } as unknown as InventoryRepository;

    mockPrisma = {};

    movementService = new InventoryMovementService(mockPrisma, mockRepo);
  });

  describe('serializeMovement', () => {
    it('should prefix positive deltas with a plus sign', () => {
      const result = movementService.serializeMovement(sampleMovement);
      expect(result.quantityDelta).toBe('+25.0000');
      expect(result.quantityBefore).toBe('50.0000');
      expect(result.quantityAfter).toBe('75.0000');
    });

    it('should format negative deltas with minus sign', () => {
      const negativeMovement = {
        ...sampleMovement,
        movementType: 'ADJUSTMENT_DECREASE' as const,
        quantityDelta: new Prisma.Decimal('-10.0000'),
        quantityBefore: new Prisma.Decimal('75.0000'),
        quantityAfter: new Prisma.Decimal('65.0000'),
      };
      const result = movementService.serializeMovement(negativeMovement);
      expect(result.quantityDelta).toBe('-10.0000');
      expect(result.quantityBefore).toBe('75.0000');
      expect(result.quantityAfter).toBe('65.0000');
    });
  });

  describe('getStoreMovements', () => {
    it('should return paginated movements for store', async () => {
      vi.mocked(mockRepo.listMovements).mockResolvedValue({
        items: [sampleMovement as any],
        total: 1,
      });

      const result = await movementService.getStoreMovements(storeId, { page: 1, limit: 10 });
      expect(result.items.length).toBe(1);
      expect(result.pagination.totalItems).toBe(1);
      expect(mockRepo.listMovements).toHaveBeenCalledWith(storeId, { page: 1, limit: 10 }, 0, 10);
    });
  });

  describe('getVariantMovements', () => {
    it('should filter movements by variantId', async () => {
      vi.mocked(mockRepo.listMovements).mockResolvedValue({
        items: [sampleMovement as any],
        total: 1,
      });

      const result = await movementService.getVariantMovements(storeId, variantId, { page: 1, limit: 10 });
      expect(result.items.length).toBe(1);
      expect(mockRepo.listMovements).toHaveBeenCalledWith(
        storeId,
        expect.objectContaining({ variantId }),
        0,
        10
      );
    });
  });
});
