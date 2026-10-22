import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { InventoryTransferService } from '../../src/modules/inventory/inventory-transfer.service.js';
import type { InventoryRepository } from '../../src/modules/inventory/inventory.repository.js';

describe('Inventory Concurrency & Deadlock Prevention (Unit)', () => {
  let mockPrisma: any;
  let mockRepo: InventoryRepository;
  let transferService: InventoryTransferService;

  const sourceStoreId = '11111111-1111-4111-a111-111111111111';
  const destStoreId = '22222222-2222-4222-a222-222222222222';
  const transferId = '33333333-3333-4333-a333-333333333333';

  // Two variant IDs in reverse alphabetical order to verify sorting
  const variantA = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
  const variantZ = 'zzzzzzzz-zzzz-4zzz-zzzz-zzzzzzzzzzzz';

  const multiItemTransfer = {
    id: transferId,
    transferNumber: 'TRF-MULTI-01',
    sourceStoreId,
    destinationStoreId: destStoreId,
    status: 'APPROVED' as const,
    sourceStore: { id: sourceStoreId, name: 'Source', code: 'SRC' },
    destinationStore: { id: destStoreId, name: 'Dest', code: 'DST' },
    items: [
      {
        id: 'item-z',
        transferId,
        variantId: variantZ, // Z first in array
        quantityRequested: new Prisma.Decimal('10.0000'),
        quantityShipped: new Prisma.Decimal('0.0000'),
        quantityReceived: new Prisma.Decimal('0.0000'),
      },
      {
        id: 'item-a',
        transferId,
        variantId: variantA, // A second in array
        quantityRequested: new Prisma.Decimal('20.0000'),
        quantityShipped: new Prisma.Decimal('0.0000'),
        quantityReceived: new Prisma.Decimal('0.0000'),
      },
    ],
  };

  beforeEach(() => {
    mockRepo = {
      findTransferById: vi.fn(),
      findBalanceForUpdate: vi.fn(),
      updateBalance: vi.fn(),
      createMovement: vi.fn(),
      updateTransferItem: vi.fn(),
      updateTransfer: vi.fn(),
    } as unknown as InventoryRepository;

    mockPrisma = {
      inventoryTransfer: { update: vi.fn() },
      $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
    };

    transferService = new InventoryTransferService(mockPrisma, mockRepo);
  });

  it('should acquire row locks in deterministic alphabetical order to prevent deadlocks', async () => {
    vi.mocked(mockRepo.findTransferById).mockResolvedValue(multiItemTransfer as any);

    const lockOrder: string[] = [];
    vi.mocked(mockRepo.findBalanceForUpdate).mockImplementation(async (_storeId, variantId) => {
      lockOrder.push(variantId);
      return {
        id: `bal-${variantId}`,
        store_id: sourceStoreId,
        variant_id: variantId,
        quantity_on_hand: new Prisma.Decimal('100.0000'),
        quantity_reserved: new Prisma.Decimal('0.0000'),
        reorder_level: new Prisma.Decimal('10.0000'),
      };
    });

    mockPrisma.inventoryTransfer.update.mockResolvedValue({
      ...multiItemTransfer,
      status: 'SHIPPED',
    });

    await transferService.shipTransfer(transferId);

    // Verify lock order was variantA first, then variantZ (alphabetical sort)
    expect(lockOrder).toEqual([variantA, variantZ]);
  });
});
