import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { InventoryReservationService } from '../../src/modules/inventory/inventory-reservation.service.js';
import { InventoryService } from '../../src/modules/inventory/inventory.service.js';
import type { InventoryRepository } from '../../src/modules/inventory/inventory.repository.js';
import { ConflictError, NotFoundError } from '../../src/common/errors/app-error.js';
import { InsufficientStockError } from '../../src/modules/inventory/inventory.errors.js';

describe('InventoryReservationService (Unit)', () => {
  let mockPrisma: any;
  let mockRepo: InventoryRepository;
  let inventoryService: InventoryService;
  let reservationService: InventoryReservationService;

  const storeId = '11111111-1111-4111-a111-111111111111';
  const variantId = '22222222-2222-4222-a222-222222222222';
  const reservationId = '33333333-3333-4333-a333-333333333333';
  const userId = '44444444-4444-4444-a444-444444444444';
  const mockDate = new Date('2026-10-22T10:00:00Z');

  const sampleReservation = {
    id: reservationId,
    storeId,
    variantId,
    quantity: new Prisma.Decimal('10.0000'),
    status: 'ACTIVE' as const,
    referenceType: 'CHECKOUT_RESERVATION',
    referenceId: 'CHK-001',
    expiresAt: null,
    createdByUserId: userId,
    createdByUser: { id: userId, name: 'Cashier User', email: 'cashier@store.local' },
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  const sampleBalanceRecord = {
    id: 'bal-1',
    storeId,
    variantId,
    quantityOnHand: new Prisma.Decimal('100.0000'),
    quantityReserved: new Prisma.Decimal('20.0000'),
    reorderLevel: new Prisma.Decimal('10.0000'),
    store: { id: storeId, name: 'Main Store', code: 'MAIN-01' },
    variant: {
      id: variantId,
      productId: 'prod-1',
      name: 'Variant',
      sku: 'SKU-01',
      barcode: '123',
      price: new Prisma.Decimal('29.99'),
    },
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  beforeEach(() => {
    mockRepo = {
      ensureBalanceExists: vi.fn(),
      findBalanceForUpdate: vi.fn(),
      createReservation: vi.fn(),
      findReservationById: vi.fn(),
      updateReservation: vi.fn(),
      createMovement: vi.fn(),
      updateBalance: vi.fn(),
      findBalance: vi.fn(),
    } as unknown as InventoryRepository;

    mockPrisma = {
      store: { findUnique: vi.fn() },
      productVariant: { findUnique: vi.fn() },
      $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
    };

    inventoryService = new InventoryService(mockPrisma, mockRepo);
    reservationService = new InventoryReservationService(mockPrisma, mockRepo, inventoryService);
  });

  describe('createReservation', () => {
    it('should create an active reservation when sufficient available stock exists', async () => {
      mockPrisma.store.findUnique.mockResolvedValue({ id: storeId, status: 'ACTIVE', deletedAt: null });
      mockPrisma.productVariant.findUnique.mockResolvedValue({ id: variantId, status: 'ACTIVE' });

      vi.mocked(mockRepo.findBalanceForUpdate).mockResolvedValue({
        id: sampleBalanceRecord.id,
        store_id: storeId,
        variant_id: variantId,
        quantity_on_hand: new Prisma.Decimal('100.0000'),
        quantity_reserved: new Prisma.Decimal('20.0000'), // 80 available
        reorder_level: new Prisma.Decimal('10.0000'),
      });

      vi.mocked(mockRepo.createReservation).mockResolvedValue(sampleReservation as any);
      vi.mocked(mockRepo.updateBalance).mockResolvedValue({
        ...sampleBalanceRecord,
        quantityReserved: new Prisma.Decimal('30.0000'),
      } as any);

      const result = await reservationService.createReservation(
        storeId,
        { variantId, quantity: 10 },
        userId
      );

      expect(result.reservation.status).toBe('ACTIVE');
      expect(result.reservation.quantity).toBe('10.0000');
      expect(mockRepo.createMovement).toHaveBeenCalledWith(
        expect.objectContaining({
          movementType: 'RESERVATION_CREATED',
          quantityDelta: expect.any(Prisma.Decimal),
        }),
        expect.anything()
      );
    });

    it('should reject reservation exceeding available stock', async () => {
      mockPrisma.store.findUnique.mockResolvedValue({ id: storeId, status: 'ACTIVE', deletedAt: null });
      mockPrisma.productVariant.findUnique.mockResolvedValue({ id: variantId, status: 'ACTIVE' });

      vi.mocked(mockRepo.findBalanceForUpdate).mockResolvedValue({
        id: sampleBalanceRecord.id,
        store_id: storeId,
        variant_id: variantId,
        quantity_on_hand: new Prisma.Decimal('100.0000'),
        quantity_reserved: new Prisma.Decimal('90.0000'), // Only 10 available
        reorder_level: new Prisma.Decimal('10.0000'),
      });

      await expect(
        reservationService.createReservation(storeId, { variantId, quantity: 25 }, userId)
      ).rejects.toThrow(InsufficientStockError);
    });
  });

  describe('releaseReservation', () => {
    it('should release active reservation and restore available stock', async () => {
      vi.mocked(mockRepo.findReservationById).mockResolvedValue(sampleReservation as any);
      vi.mocked(mockRepo.findBalanceForUpdate).mockResolvedValue({
        id: sampleBalanceRecord.id,
        store_id: storeId,
        variant_id: variantId,
        quantity_on_hand: new Prisma.Decimal('100.0000'),
        quantity_reserved: new Prisma.Decimal('30.0000'),
        reorder_level: new Prisma.Decimal('10.0000'),
      });

      vi.mocked(mockRepo.updateReservation).mockResolvedValue({
        ...sampleReservation,
        status: 'RELEASED',
      } as any);

      vi.mocked(mockRepo.updateBalance).mockResolvedValue({
        ...sampleBalanceRecord,
        quantityReserved: new Prisma.Decimal('20.0000'),
      } as any);

      const result = await reservationService.releaseReservation(storeId, reservationId, userId);

      expect(result.reservation.status).toBe('RELEASED');
      expect(mockRepo.updateBalance).toHaveBeenCalledWith(
        sampleBalanceRecord.id,
        { quantityReserved: new Prisma.Decimal('20.0000') },
        expect.anything()
      );
    });

    it('should reject releasing an already released reservation', async () => {
      vi.mocked(mockRepo.findReservationById).mockResolvedValue({
        ...sampleReservation,
        status: 'RELEASED',
      } as any);

      await expect(
        reservationService.releaseReservation(storeId, reservationId, userId)
      ).rejects.toThrow(ConflictError);
    });
  });

  describe('fulfillReservation', () => {
    it('should fulfill active reservation, simultaneously decrementing on-hand and reserved stock', async () => {
      vi.mocked(mockRepo.findReservationById).mockResolvedValue(sampleReservation as any);
      vi.mocked(mockRepo.findBalanceForUpdate).mockResolvedValue({
        id: sampleBalanceRecord.id,
        store_id: storeId,
        variant_id: variantId,
        quantity_on_hand: new Prisma.Decimal('100.0000'),
        quantity_reserved: new Prisma.Decimal('10.0000'),
        reorder_level: new Prisma.Decimal('10.0000'),
      });

      vi.mocked(mockRepo.updateReservation).mockResolvedValue({
        ...sampleReservation,
        status: 'FULFILLED',
      } as any);

      vi.mocked(mockRepo.updateBalance).mockResolvedValue({
        ...sampleBalanceRecord,
        quantityOnHand: new Prisma.Decimal('90.0000'),
        quantityReserved: new Prisma.Decimal('0.0000'),
      } as any);

      const result = await reservationService.fulfillReservation(storeId, reservationId, userId);

      expect(result.reservation.status).toBe('FULFILLED');
      expect(mockRepo.updateBalance).toHaveBeenCalledWith(
        sampleBalanceRecord.id,
        {
          quantityOnHand: new Prisma.Decimal('90.0000'),
          quantityReserved: new Prisma.Decimal('0.0000'),
        },
        expect.anything()
      );
    });
  });
});
