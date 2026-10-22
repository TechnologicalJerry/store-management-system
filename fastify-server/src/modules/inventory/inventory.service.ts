import { Prisma, type PrismaClient } from '@prisma/client';
import { InventoryRepository } from './inventory.repository.js';
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
} from '../../common/errors/app-error.js';
import {
  DuplicateIdempotencyKeyError,
  InsufficientStockError,
} from './inventory.errors.js';
import {
  buildPaginatedResponse,
  parsePagination,
} from '../../common/utils/pagination.js';
import type {
  AdjustStockDto,
  InventoryBalanceResponseDto,
  InventoryMovementResponseDto,
  InventoryQueryDto,
  LowStockQueryDto,
  MovementQueryDto,
  ReceiveStockDto,
} from './inventory.types.js';

export class InventoryService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly repository: InventoryRepository
  ) {}

  // ============================================================================
  // Serialization Helpers
  // ============================================================================

  /**
   * Serializes a Prisma InventoryBalance record into clean API DTO with derived availability.
   */
  public serializeBalance(balance: any): InventoryBalanceResponseDto {
    const onHand = new Prisma.Decimal(balance.quantityOnHand.toString());
    const reserved = new Prisma.Decimal(balance.quantityReserved.toString());
    const available = onHand.minus(reserved);
    const reorder = new Prisma.Decimal(balance.reorderLevel.toString());

    return {
      id: balance.id,
      storeId: balance.storeId,
      variantId: balance.variantId,
      quantityOnHand: onHand.toFixed(4),
      quantityReserved: reserved.toFixed(4),
      quantityAvailable: available.toFixed(4),
      reorderLevel: reorder.toFixed(4),
      isLowStock: onHand.lessThanOrEqualTo(reorder),
      store: balance.store
        ? {
            id: balance.store.id,
            name: balance.store.name,
            code: balance.store.code,
          }
        : undefined,
      variant: balance.variant
        ? {
            id: balance.variant.id,
            productId: balance.variant.productId,
            name: balance.variant.name,
            sku: balance.variant.sku,
            barcode: balance.variant.barcode,
            price: balance.variant.price.toString(),
            product: balance.variant.product
              ? {
                  id: balance.variant.product.id,
                  name: balance.variant.product.name,
                  slug: balance.variant.product.slug,
                }
              : undefined,
          }
        : undefined,
      createdAt: balance.createdAt.toISOString(),
      updatedAt: balance.updatedAt.toISOString(),
    };
  }

  /**
   * Serializes a Prisma InventoryMovement record into clean API DTO.
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

  // ============================================================================
  // Stock Receiving Workflow
  // ============================================================================

  /**
   * Receives incoming stock into store inventory atomically and idempotently.
   */
  async receiveStock(storeId: string, dto: ReceiveStockDto, performedByUserId?: string) {
    const receiveQty = new Prisma.Decimal(dto.quantity.toString());
    if (receiveQty.lessThanOrEqualTo(0)) {
      throw new BadRequestError('Received quantity must be greater than zero.');
    }

    // 1. Verify store exists and is active
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!store || store.deletedAt !== null) {
      throw new NotFoundError('Target store not found.');
    }
    if (store.status !== 'ACTIVE') {
      throw new BadRequestError(`Cannot receive stock into ${store.status.toLowerCase()} store.`);
    }

    // 2. Verify variant exists and is active
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
      select: { id: true, status: true },
    });
    if (!variant) {
      throw new NotFoundError('Product variant not found.');
    }
    if (variant.status !== 'ACTIVE') {
      throw new BadRequestError(`Cannot receive stock for ${variant.status.toLowerCase()} variant.`);
    }

    // 3. Idempotency Check
    if (dto.idempotencyKey) {
      const existingMovement = await this.repository.findMovementByIdempotencyKey(
        storeId,
        dto.idempotencyKey
      );
      if (existingMovement) {
        const delta = new Prisma.Decimal(existingMovement.quantityDelta.toString());
        if (existingMovement.variantId === dto.variantId && delta.equals(receiveQty)) {
          // Idempotent replay: return current balance and existing movement
          const currentBalance = await this.repository.findBalance(storeId, dto.variantId);
          return {
            balance: this.serializeBalance(currentBalance),
            movement: this.serializeMovement(existingMovement),
          };
        }
        throw new DuplicateIdempotencyKeyError();
      }
    }

    // 4. Atomic Transaction with Concurrency Row Lock
    return this.prisma.$transaction(async tx => {
      // Ensure initial record exists safely
      await this.repository.ensureBalanceExists(storeId, dto.variantId, new Prisma.Decimal(0), tx);

      // Acquire exclusive row lock
      const lockedRow = await this.repository.findBalanceForUpdate(storeId, dto.variantId, tx);
      if (!lockedRow) {
        throw new ConflictError('Unable to acquire lock on inventory balance.');
      }

      const beforeOnHand = new Prisma.Decimal(lockedRow.quantity_on_hand.toString());
      const afterOnHand = beforeOnHand.plus(receiveQty);

      // Create movement ledger entry
      const movement = await this.repository.createMovement(
        {
          storeId,
          variantId: dto.variantId,
          movementType: 'STOCK_RECEIVED',
          quantityDelta: receiveQty,
          quantityBefore: beforeOnHand,
          quantityAfter: afterOnHand,
          referenceType: dto.referenceType || 'STOCK_RECEIPT',
          referenceId: dto.referenceId,
          idempotencyKey: dto.idempotencyKey,
          reason: dto.reason || 'Standard stock receiving',
          notes: dto.notes,
          performedByUserId,
        },
        tx
      );

      // Update balance
      const updatedBalance = await this.repository.updateBalance(
        lockedRow.id,
        {
          quantityOnHand: afterOnHand,
        },
        tx
      );

      return {
        balance: this.serializeBalance(updatedBalance),
        movement: this.serializeMovement(movement),
      };
    });
  }

  // ============================================================================
  // Stock Adjustment Workflow
  // ============================================================================

  /**
   * Adjusts stock up or down with mandatory reason and ledger tracking.
   */
  async adjustStock(storeId: string, dto: AdjustStockDto, performedByUserId?: string) {
    const adjustQty = new Prisma.Decimal(dto.quantity.toString());
    if (adjustQty.lessThanOrEqualTo(0)) {
      throw new BadRequestError('Adjustment quantity must be greater than zero.');
    }

    if (!dto.reason || dto.reason.trim().length === 0) {
      throw new BadRequestError('Reason is mandatory for stock adjustment.');
    }

    // 1. Verify store exists and is active
    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!store || store.deletedAt !== null) {
      throw new NotFoundError('Target store not found.');
    }
    if (store.status !== 'ACTIVE') {
      throw new BadRequestError(`Cannot adjust stock in ${store.status.toLowerCase()} store.`);
    }

    // 2. Verify variant exists
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
      select: { id: true },
    });
    if (!variant) {
      throw new NotFoundError('Product variant not found.');
    }

    // 3. Idempotency Check
    if (dto.idempotencyKey) {
      const existingMovement = await this.repository.findMovementByIdempotencyKey(
        storeId,
        dto.idempotencyKey
      );
      if (existingMovement) {
        const delta = new Prisma.Decimal(existingMovement.quantityDelta.toString());
        const expectedDelta =
          dto.adjustmentType === 'INCREASE' ? adjustQty : adjustQty.negated();

        if (existingMovement.variantId === dto.variantId && delta.equals(expectedDelta)) {
          const currentBalance = await this.repository.findBalance(storeId, dto.variantId);
          return {
            balance: this.serializeBalance(currentBalance),
            movement: this.serializeMovement(existingMovement),
          };
        }
        throw new DuplicateIdempotencyKeyError();
      }
    }

    // 4. Atomic Transaction with Concurrency Lock
    return this.prisma.$transaction(async tx => {
      await this.repository.ensureBalanceExists(storeId, dto.variantId, new Prisma.Decimal(0), tx);

      const lockedRow = await this.repository.findBalanceForUpdate(storeId, dto.variantId, tx);
      if (!lockedRow) {
        throw new ConflictError('Unable to lock inventory balance for adjustment.');
      }

      const beforeOnHand = new Prisma.Decimal(lockedRow.quantity_on_hand.toString());
      const reserved = new Prisma.Decimal(lockedRow.quantity_reserved.toString());
      let afterOnHand: Prisma.Decimal;
      let signedDelta: Prisma.Decimal;
      let movementType: 'ADJUSTMENT_INCREASE' | 'ADJUSTMENT_DECREASE';

      if (dto.adjustmentType === 'INCREASE') {
        afterOnHand = beforeOnHand.plus(adjustQty);
        signedDelta = adjustQty;
        movementType = 'ADJUSTMENT_INCREASE';
      } else {
        afterOnHand = beforeOnHand.minus(adjustQty);
        signedDelta = adjustQty.negated();
        movementType = 'ADJUSTMENT_DECREASE';

        // Invariant check: cannot decrease below reserved or negative
        if (afterOnHand.lessThan(reserved)) {
          throw new InsufficientStockError(
            `Adjustment decrease of ${adjustQty.toFixed(4)} would violate reserved stock invariant (Reserved: ${reserved.toFixed(4)}, Available: ${beforeOnHand.minus(reserved).toFixed(4)}).`
          );
        }
        if (afterOnHand.lessThan(0)) {
          throw new InsufficientStockError(
            `Adjustment decrease of ${adjustQty.toFixed(4)} would result in negative stock on hand (${afterOnHand.toFixed(4)}).`
          );
        }
      }

      const movement = await this.repository.createMovement(
        {
          storeId,
          variantId: dto.variantId,
          movementType,
          quantityDelta: signedDelta,
          quantityBefore: beforeOnHand,
          quantityAfter: afterOnHand,
          referenceType: 'MANUAL_ADJUSTMENT',
          idempotencyKey: dto.idempotencyKey,
          reason: dto.reason,
          notes: dto.notes,
          performedByUserId,
        },
        tx
      );

      const updatedBalance = await this.repository.updateBalance(
        lockedRow.id,
        {
          quantityOnHand: afterOnHand,
        },
        tx
      );

      return {
        balance: this.serializeBalance(updatedBalance),
        movement: this.serializeMovement(movement),
      };
    });
  }

  // ============================================================================
  // Inventory Queries
  // ============================================================================

  /**
   * Retrieves balance for a specific variant in a store.
   */
  async getBalance(storeId: string, variantId: string) {
    const balance = await this.repository.findBalance(storeId, variantId);
    if (!balance) {
      throw new NotFoundError('Inventory balance not found for this variant at the specified store.');
    }
    return this.serializeBalance(balance);
  }

  /**
   * Lists inventory balances for a store with filtering and pagination.
   */
  async listBalances(storeId: string, query: InventoryQueryDto) {
    const { page, limit, skip } = parsePagination(query);

    if (query.lowStockOnly) {
      const { items, total } = await this.repository.listLowStockBalances(
        storeId,
        query.categoryId,
        skip,
        limit
      );
      return buildPaginatedResponse(items.map(b => this.serializeBalance(b)), total, page, limit);
    }

    const { items, total } = await this.repository.listBalances(storeId, query, skip, limit);
    return buildPaginatedResponse(items.map(b => this.serializeBalance(b)), total, page, limit);
  }

  /**
   * Lists low stock balances for a store.
   */
  async listLowStock(storeId: string, query: LowStockQueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const { items, total } = await this.repository.listLowStockBalances(
      storeId,
      query.categoryId,
      skip,
      limit
    );
    return buildPaginatedResponse(items.map(b => this.serializeBalance(b)), total, page, limit);
  }

  /**
   * Lists inventory movements with filtering and pagination.
   */
  async listMovements(storeId: string, query: MovementQueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const { items, total } = await this.repository.listMovements(storeId, query, skip, limit);
    return buildPaginatedResponse(items.map(m => this.serializeMovement(m)), total, page, limit);
  }
}
