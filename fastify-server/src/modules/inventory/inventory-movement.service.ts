import { Prisma, type PrismaClient } from '@prisma/client';
import { InventoryRepository } from './inventory.repository.js';
import { buildPaginatedResponse, parsePagination } from '../../common/utils/pagination.js';
import type { InventoryMovementResponseDto, MovementQueryDto } from './inventory.types.js';

export class InventoryMovementService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly repository: InventoryRepository
  ) {}

  /**
   * Serializes an InventoryMovement database record into clean API DTO.
   */
  public serializeMovement(movement: any): InventoryMovementResponseDto {
    const delta = new Prisma.Decimal(movement.quantityDelta.toString());
    const signedDelta = delta.isPositive() ? `+${delta.toFixed(4)}` : delta.toFixed(4);

    return {
      id: movement.id,
      storeId: movement.storeId,
      variantId: movement.variantId,
      movementType: movement.movementType,
      quantityDelta: signedDelta,
      quantityBefore: new Prisma.Decimal(movement.quantityBefore.toString()).toFixed(4),
      quantityAfter: new Prisma.Decimal(movement.quantityAfter.toString()).toFixed(4),
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      idempotencyKey: movement.idempotencyKey,
      reason: movement.reason,
      notes: movement.notes,
      performedByUserId: movement.performedByUserId,
      performedByUser: movement.performedByUser
        ? {
            id: movement.performedByUser.id,
            name: movement.performedByUser.name,
            email: movement.performedByUser.email,
          }
        : null,
      createdAt: movement.createdAt.toISOString(),
    };
  }

  /**
   * Retrieves paginated movement audit ledger entries for a store.
   */
  async getStoreMovements(storeId: string, query: MovementQueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const { items, total } = await this.repository.listMovements(storeId, query, skip, limit);
    return buildPaginatedResponse(items.map(m => this.serializeMovement(m)), total, page, limit);
  }

  /**
   * Retrieves paginated movement history for a specific variant in a store.
   */
  async getVariantMovements(storeId: string, variantId: string, query: MovementQueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const { items, total } = await this.repository.listMovements(
      storeId,
      { ...query, variantId },
      skip,
      limit
    );
    return buildPaginatedResponse(items.map(m => this.serializeMovement(m)), total, page, limit);
  }
}
