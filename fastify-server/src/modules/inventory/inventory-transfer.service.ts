import { Prisma, type PrismaClient } from '@prisma/client';
import { InventoryRepository } from './inventory.repository.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { InsufficientStockError, InvalidTransferStateError } from './inventory.errors.js';
import { buildPaginatedResponse, parsePagination } from '../../common/utils/pagination.js';
import type {
  CreateTransferDto,
  InventoryTransferResponseDto,
  ReceiveTransferDto,
  ShipTransferDto,
  TransferQueryDto,
} from './inventory.types.js';

export class InventoryTransferService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly repository: InventoryRepository
  ) {}

  /**
   * Serializes a Prisma InventoryTransfer record into clean API DTO.
   */
  public serializeTransfer(transfer: any): InventoryTransferResponseDto {
    return {
      id: transfer.id,
      transferNumber: transfer.transferNumber,
      sourceStoreId: transfer.sourceStoreId,
      destinationStoreId: transfer.destinationStoreId,
      status: transfer.status,
      notes: transfer.notes,
      sourceStore: transfer.sourceStore
        ? {
            id: transfer.sourceStore.id,
            name: transfer.sourceStore.name,
            code: transfer.sourceStore.code,
          }
        : undefined,
      destinationStore: transfer.destinationStore
        ? {
            id: transfer.destinationStore.id,
            name: transfer.destinationStore.name,
            code: transfer.destinationStore.code,
          }
        : undefined,
      items: (transfer.items || []).map((item: any) => ({
        id: item.id,
        transferId: item.transferId,
        variantId: item.variantId,
        quantityRequested: new Prisma.Decimal(item.quantityRequested.toString()).toFixed(4),
        quantityShipped: new Prisma.Decimal(item.quantityShipped.toString()).toFixed(4),
        quantityReceived: new Prisma.Decimal(item.quantityReceived.toString()).toFixed(4),
        notes: item.notes,
        variant: item.variant
          ? {
              id: item.variant.id,
              productId: item.variant.productId,
              name: item.variant.name,
              sku: item.variant.sku,
              barcode: item.variant.barcode,
              product: item.variant.product
                ? {
                    id: item.variant.product.id,
                    name: item.variant.product.name,
                    slug: item.variant.product.slug,
                  }
                : undefined,
            }
          : undefined,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      createdByUserId: transfer.createdByUserId,
      approvedByUserId: transfer.approvedByUserId,
      shippedByUserId: transfer.shippedByUserId,
      receivedByUserId: transfer.receivedByUserId,
      shippedAt: transfer.shippedAt ? transfer.shippedAt.toISOString() : null,
      receivedAt: transfer.receivedAt ? transfer.receivedAt.toISOString() : null,
      cancelledAt: transfer.cancelledAt ? transfer.cancelledAt.toISOString() : null,
      createdAt: transfer.createdAt.toISOString(),
      updatedAt: transfer.updatedAt.toISOString(),
    };
  }

  /**
   * Generates a unique, human-readable transfer number.
   */
  private generateTransferNumber(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomPart = Math.floor(1000 + Math.random() * 9000);
    return `TRF-${dateStr}-${randomPart}`;
  }

  // ============================================================================
  // Transfer Lifecycle Workflows
  // ============================================================================

  /**
   * Creates a new inter-store transfer in DRAFT status.
   */
  async createTransfer(dto: CreateTransferDto, performedByUserId?: string) {
    if (dto.sourceStoreId === dto.destinationStoreId) {
      throw new BadRequestError('Source and destination stores must be different.');
    }

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestError('At least one item line is required for a transfer.');
    }

    // 1. Verify source store exists and is active
    const sourceStore = await this.prisma.store.findUnique({
      where: { id: dto.sourceStoreId },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!sourceStore || sourceStore.deletedAt !== null) {
      throw new NotFoundError('Source store not found.');
    }
    if (sourceStore.status !== 'ACTIVE') {
      throw new BadRequestError(`Cannot initiate transfer from ${sourceStore.status.toLowerCase()} source store.`);
    }

    // 2. Verify destination store exists and is active
    const destStore = await this.prisma.store.findUnique({
      where: { id: dto.destinationStoreId },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!destStore || destStore.deletedAt !== null) {
      throw new NotFoundError('Destination store not found.');
    }
    if (destStore.status !== 'ACTIVE') {
      throw new BadRequestError(`Cannot transfer into ${destStore.status.toLowerCase()} destination store.`);
    }

    // 3. Verify all variants exist
    const variantIds = dto.items.map(i => i.variantId);
    const existingVariants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: { id: true },
    });
    if (existingVariants.length !== variantIds.length) {
      throw new BadRequestError('One or more product variants in the transfer request do not exist.');
    }

    const transferNumber = this.generateTransferNumber();

    const transfer = await this.repository.createTransfer(
      {
        transferNumber,
        sourceStoreId: dto.sourceStoreId,
        destinationStoreId: dto.destinationStoreId,
        status: 'DRAFT',
        notes: dto.notes,
        createdByUserId: performedByUserId,
      },
      dto.items.map(item => ({
        variantId: item.variantId,
        quantityRequested: new Prisma.Decimal(item.quantityRequested.toString()),
        notes: item.notes,
      }))
    );

    return this.serializeTransfer(transfer);
  }

  /**
   * Submits a transfer for approval (DRAFT -> REQUESTED).
   */
  async submitTransfer(transferId: string) {
    const transfer = await this.repository.findTransferById(transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer not found.');
    }

    if (transfer.status !== 'DRAFT') {
      throw new InvalidTransferStateError(
        `Cannot submit transfer in '${transfer.status}' status. Only DRAFT transfers can be submitted.`
      );
    }

    const updated = await this.repository.updateTransfer(transferId, {
      status: 'REQUESTED',
    });

    return this.serializeTransfer(updated);
  }

  /**
   * Approves a requested transfer (REQUESTED -> APPROVED).
   */
  async approveTransfer(transferId: string, performedByUserId?: string) {
    const transfer = await this.repository.findTransferById(transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer not found.');
    }

    if (transfer.status !== 'REQUESTED' && transfer.status !== 'DRAFT') {
      throw new InvalidTransferStateError(
        `Cannot approve transfer in '${transfer.status}' status. Transfer must be in REQUESTED or DRAFT status.`
      );
    }

    const updated = await this.repository.updateTransfer(transferId, {
      status: 'APPROVED',
      approvedByUserId: performedByUserId,
    });

    return this.serializeTransfer(updated);
  }

  /**
   * Ships a transfer (APPROVED -> SHIPPED).
   * Atomically checks available stock, locks rows deterministically (deadlock-free),
   * decrements source on-hand stock, and logs TRANSFER_OUT movements.
   */
  async shipTransfer(transferId: string, dto?: ShipTransferDto, performedByUserId?: string) {
    const transfer = await this.repository.findTransferById(transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer not found.');
    }

    if (transfer.status !== 'APPROVED') {
      throw new InvalidTransferStateError(
        `Cannot ship transfer in '${transfer.status}' status. Only APPROVED transfers may be shipped.`
      );
    }

    return this.prisma.$transaction(async tx => {
      // Sort item variants alphabetically to guarantee deterministic lock acquisition order (prevents deadlocks)
      const sortedItems = [...transfer.items].sort((a, b) => a.variantId.localeCompare(b.variantId));

      for (const item of sortedItems) {
        // Resolve shipped quantity
        let shippedQty = new Prisma.Decimal(item.quantityRequested.toString());
        if (dto?.items) {
          const match = dto.items.find(i => i.variantId === item.variantId);
          if (match) {
            shippedQty = new Prisma.Decimal(match.quantityShipped.toString());
          }
        }

        if (shippedQty.lessThanOrEqualTo(0)) {
          throw new BadRequestError(`Shipped quantity for variant ${item.variantId} must be positive.`);
        }

        // Lock source balance row
        const lockedRow = await this.repository.findBalanceForUpdate(
          transfer.sourceStoreId,
          item.variantId,
          tx
        );

        if (!lockedRow) {
          throw new InsufficientStockError(
            `No inventory balance record exists at source store for variant ${item.variantId}.`
          );
        }

        const sourceOnHand = new Prisma.Decimal(lockedRow.quantity_on_hand.toString());
        const sourceReserved = new Prisma.Decimal(lockedRow.quantity_reserved.toString());
        const available = sourceOnHand.minus(sourceReserved);

        if (available.lessThan(shippedQty)) {
          throw new InsufficientStockError(
            `Insufficient available stock at source store for variant ${item.variantId}. Available: ${available.toFixed(4)}, Required: ${shippedQty.toFixed(4)}.`
          );
        }

        const newSourceOnHand = sourceOnHand.minus(shippedQty);

        // Deduct source stock
        await this.repository.updateBalance(
          lockedRow.id,
          {
            quantityOnHand: newSourceOnHand,
          },
          tx
        );

        // Record TRANSFER_OUT movement at source store
        await this.repository.createMovement(
          {
            storeId: transfer.sourceStoreId,
            variantId: item.variantId,
            movementType: 'TRANSFER_OUT',
            quantityDelta: shippedQty.negated(),
            quantityBefore: sourceOnHand,
            quantityAfter: newSourceOnHand,
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            reason: `Transfer shipment ${transfer.transferNumber} to store ${transfer.destinationStoreId}`,
            performedByUserId,
          },
          tx
        );

        // Update item quantityShipped
        await this.repository.updateTransferItem(
          item.id,
          {
            quantityShipped: shippedQty,
          },
          tx
        );
      }

      // Mark transfer as SHIPPED
      const updatedTransfer = await tx.inventoryTransfer.update({
        where: { id: transferId },
        data: {
          status: 'SHIPPED',
          shippedByUserId: performedByUserId,
          shippedAt: new Date(),
        },
        include: {
          sourceStore: { select: { id: true, name: true, code: true } },
          destinationStore: { select: { id: true, name: true, code: true } },
          items: {
            include: {
              variant: {
                include: {
                  product: { select: { id: true, name: true, slug: true } },
                },
              },
            },
          },
        },
      });

      return this.serializeTransfer(updatedTransfer);
    });
  }

  /**
   * Confirms receipt of transfer items at destination store (SHIPPED -> RECEIVED or PARTIALLY_RECEIVED).
   * Atomically locks destination rows, increments destination stock, and logs TRANSFER_IN movements.
   */
  async receiveTransfer(transferId: string, dto?: ReceiveTransferDto, performedByUserId?: string) {
    const transfer = await this.repository.findTransferById(transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer not found.');
    }

    if (transfer.status !== 'SHIPPED') {
      throw new InvalidTransferStateError(
        `Cannot receive transfer in '${transfer.status}' status. Transfer must be in SHIPPED status.`
      );
    }

    return this.prisma.$transaction(async tx => {
      let isPartial = false;
      const sortedItems = [...transfer.items].sort((a, b) => a.variantId.localeCompare(b.variantId));

      for (const item of sortedItems) {
        let receivedQty = new Prisma.Decimal(item.quantityShipped.toString());
        let itemNotes = item.notes;

        if (dto?.items) {
          const match = dto.items.find(i => i.variantId === item.variantId);
          if (match) {
            receivedQty = new Prisma.Decimal(match.quantityReceived.toString());
            itemNotes = match.notes || itemNotes;
          }
        }

        if (receivedQty.lessThan(0)) {
          throw new BadRequestError(`Received quantity for variant ${item.variantId} cannot be negative.`);
        }

        if (receivedQty.lessThan(new Prisma.Decimal(item.quantityShipped.toString()))) {
          isPartial = true;
        }

        // Ensure destination balance row exists
        await this.repository.ensureBalanceExists(
          transfer.destinationStoreId,
          item.variantId,
          new Prisma.Decimal(0),
          tx
        );

        // Lock destination row
        const lockedRow = await this.repository.findBalanceForUpdate(
          transfer.destinationStoreId,
          item.variantId,
          tx
        );

        if (!lockedRow) {
          throw new ConflictError('Unable to lock destination inventory balance.');
        }

        const destBeforeOnHand = new Prisma.Decimal(lockedRow.quantity_on_hand.toString());
        const destAfterOnHand = destBeforeOnHand.plus(receivedQty);

        // Increment destination stock
        await this.repository.updateBalance(
          lockedRow.id,
          {
            quantityOnHand: destAfterOnHand,
          },
          tx
        );

        // Record TRANSFER_IN movement at destination store
        await this.repository.createMovement(
          {
            storeId: transfer.destinationStoreId,
            variantId: item.variantId,
            movementType: 'TRANSFER_IN',
            quantityDelta: receivedQty,
            quantityBefore: destBeforeOnHand,
            quantityAfter: destAfterOnHand,
            referenceType: 'TRANSFER',
            referenceId: transfer.id,
            reason: `Transfer received ${transfer.transferNumber} from store ${transfer.sourceStoreId}`,
            notes: itemNotes,
            performedByUserId,
          },
          tx
        );

        // Update item quantityReceived
        await this.repository.updateTransferItem(
          item.id,
          {
            quantityReceived: receivedQty,
            notes: itemNotes,
          },
          tx
        );
      }

      const finalStatus = isPartial ? 'PARTIALLY_RECEIVED' : 'RECEIVED';

      const updatedTransfer = await tx.inventoryTransfer.update({
        where: { id: transferId },
        data: {
          status: finalStatus,
          notes: dto?.notes ? `${transfer.notes ? transfer.notes + '\n' : ''}${dto.notes}` : transfer.notes,
          receivedByUserId: performedByUserId,
          receivedAt: new Date(),
        },
        include: {
          sourceStore: { select: { id: true, name: true, code: true } },
          destinationStore: { select: { id: true, name: true, code: true } },
          items: {
            include: {
              variant: {
                include: {
                  product: { select: { id: true, name: true, slug: true } },
                },
              },
            },
          },
        },
      });

      return this.serializeTransfer(updatedTransfer);
    });
  }

  /**
   * Cancels a transfer if not yet shipped (DRAFT, REQUESTED, APPROVED -> CANCELLED).
   */
  async cancelTransfer(transferId: string, performedByUserId?: string) {
    const transfer = await this.repository.findTransferById(transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer not found.');
    }

    if (transfer.status === 'SHIPPED' || transfer.status === 'RECEIVED' || transfer.status === 'PARTIALLY_RECEIVED') {
      throw new InvalidTransferStateError(
        `Cannot cancel transfer in '${transfer.status}' status. Transfer has already departed or completed.`
      );
    }

    if (transfer.status === 'CANCELLED') {
      throw new ConflictError('Transfer is already cancelled.');
    }

    const updated = await this.repository.updateTransfer(transferId, {
      status: 'CANCELLED',
      cancelledAt: new Date(),
    });

    return this.serializeTransfer(updated);
  }

  /**
   * Retrieves transfer details by ID.
   */
  async getTransferById(transferId: string) {
    const transfer = await this.repository.findTransferById(transferId);
    if (!transfer) {
      throw new NotFoundError('Transfer not found.');
    }
    return this.serializeTransfer(transfer);
  }

  /**
   * Lists transfers with filtering and pagination.
   */
  async listTransfers(query: TransferQueryDto) {
    const { page, limit, skip } = parsePagination(query);
    const { items, total } = await this.repository.listTransfers(query, skip, limit);
    return buildPaginatedResponse(items.map(t => this.serializeTransfer(t)), total, page, limit);
  }
}
