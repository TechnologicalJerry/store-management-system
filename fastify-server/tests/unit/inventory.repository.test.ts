import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { InventoryRepository } from '../../src/modules/inventory/inventory.repository.js';

describe('InventoryRepository (Unit)', () => {
  let mockPrisma: any;
  let repo: InventoryRepository;

  const storeId = '11111111-1111-4111-a111-111111111111';
  const variantId = '22222222-2222-4222-a222-222222222222';

  beforeEach(() => {
    mockPrisma = {
      inventoryBalance: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      inventoryMovement: {
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      stockReservation: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      inventoryTransfer: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      $queryRaw: vi.fn(),
    };

    repo = new InventoryRepository(mockPrisma);
  });

  it('ensureBalanceExists should call upsert with storeId and variantId', async () => {
    mockPrisma.inventoryBalance.upsert.mockResolvedValue({ id: 'bal-1' });

    await repo.ensureBalanceExists(storeId, variantId);

    expect(mockPrisma.inventoryBalance.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          uq_inventory_balances_store_variant: {
            storeId,
            variantId,
          },
        },
      })
    );
  });

  it('findBalance should query unique balance compound key', async () => {
    mockPrisma.inventoryBalance.findUnique.mockResolvedValue({ id: 'bal-1' });

    await repo.findBalance(storeId, variantId);

    expect(mockPrisma.inventoryBalance.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          uq_inventory_balances_store_variant: {
            storeId,
            variantId,
          },
        },
      })
    );
  });

  it('createMovement should append to inventoryMovement table', async () => {
    mockPrisma.inventoryMovement.create.mockResolvedValue({ id: 'mov-1' });

    await repo.createMovement(
      {
        storeId,
        variantId,
        movementType: 'STOCK_RECEIVED',
        quantityDelta: new Prisma.Decimal('10.0000'),
        quantityBefore: new Prisma.Decimal('0.0000'),
        quantityAfter: new Prisma.Decimal('10.0000'),
      },
      mockPrisma
    );

    expect(mockPrisma.inventoryMovement.create).toHaveBeenCalled();
  });
});
