import { Prisma, type PrismaClient } from '@prisma/client';
import { InventoryRepository } from './inventory.repository.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { InsufficientStockError } from './inventory.errors.js';
import { InventoryService } from './inventory.service.js';
import type {
  CreateReservationDto,
  StockReservationResponseDto,
} from './inventory.types.js';

export class InventoryReservationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly repository: InventoryRepository,
    private readonly inventoryService: InventoryService
  ) {}

  /**
   * Serializes a StockReservation record into clean API DTO.
   */
  public serializeReservation(res: any): StockReservationResponseDto {
    return {
      id: res.id,
      storeId: res.storeId,
      variantId: res.variantId,
      quantity: new Prisma.Decimal(res.quantity.toString()).toFixed(4),
      status: res.status,
      referenceType: res.referenceType,
      referenceId: res.referenceId,
      expiresAt: res.expiresAt ? res.expiresAt.toISOString() : null,
      createdByUserId: res.createdByUserId,
      createdByUser: res.createdByUser
        ? {
            id: res.createdByUser.id,
            name: res.createdByUser.name,
            email: res.createdByUser.email,
          }
        : null,
      createdAt: res.createdAt.toISOString(),
      updatedAt: res.updatedAt.toISOString(),
    };
  }

  /**
   * Atomically creates a stock reservation, verifying available stock and incrementing quantityReserved.
   */
  async createReservation(
    storeId: string,
    dto: CreateReservationDto,
    performedByUserId?: string
  ) {
    const reserveQty = new Prisma.Decimal(dto.quantity.toString());
    if (reserveQty.lessThanOrEqualTo(0)) {
      throw new BadRequestError('Reservation quantity must be greater than zero.');
    }

    const store = await this.prisma.store.findUnique({
      where: { id: storeId },
      select: { id: true, status: true, deletedAt: true },
    });
    if (!store || store.deletedAt !== null) {
      throw new NotFoundError('Target store not found.');
    }
    if (store.status !== 'ACTIVE') {
      throw new BadRequestError(`Cannot reserve stock in ${store.status.toLowerCase()} store.`);
    }

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
      select: { id: true, status: true },
    });
    if (!variant) {
      throw new NotFoundError('Product variant not found.');
    }

    return this.prisma.$transaction(async tx => {
      await this.repository.ensureBalanceExists(storeId, dto.variantId, new Prisma.Decimal(0), tx);

      const lockedRow = await this.repository.findBalanceForUpdate(storeId, dto.variantId, tx);
      if (!lockedRow) {
        throw new ConflictError('Unable to lock inventory balance for reservation.');
      }

      const onHand = new Prisma.Decimal(lockedRow.quantity_on_hand.toString());
      const reserved = new Prisma.Decimal(lockedRow.quantity_reserved.toString());
      const available = onHand.minus(reserved);

      if (available.lessThan(reserveQty)) {
        throw new InsufficientStockError(
          `Insufficient stock available for reservation. Requested: ${reserveQty.toFixed(4)}, Available: ${available.toFixed(4)}.`
        );
      }

      const newReserved = reserved.plus(reserveQty);

      const reservation = await this.repository.createReservation(
        {
          storeId,
          variantId: dto.variantId,
          quantity: reserveQty,
          status: 'ACTIVE',
          referenceType: dto.referenceType || 'CHECKOUT_RESERVATION',
          referenceId: dto.referenceId,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          createdByUserId: performedByUserId,
        },
        tx
      );

      await this.repository.createMovement(
        {
          storeId,
          variantId: dto.variantId,
          movementType: 'RESERVATION_CREATED',
          quantityDelta: reserveQty,
          quantityBefore: reserved,
          quantityAfter: newReserved,
          referenceType: 'STOCK_RESERVATION',
          referenceId: reservation.id,
          reason: 'Stock reservation placed',
          performedByUserId,
        },
        tx
      );

      const updatedBalance = await this.repository.updateBalance(
        lockedRow.id,
        {
          quantityReserved: newReserved,
        },
        tx
      );

      return {
        reservation: this.serializeReservation(reservation),
        balance: this.inventoryService.serializeBalance(updatedBalance),
      };
    });
  }

  /**
   * Releases an active reservation, decrementing quantityReserved and restoring available stock.
   */
  async releaseReservation(
    storeId: string,
    reservationId: string,
    performedByUserId?: string
  ) {
    const reservation = await this.repository.findReservationById(reservationId);
    if (!reservation || reservation.storeId !== storeId) {
      throw new NotFoundError('Stock reservation not found at this store.');
    }

    if (reservation.status !== 'ACTIVE') {
      throw new ConflictError(
        `Cannot release reservation in '${reservation.status}' status. Only ACTIVE reservations may be released.`
      );
    }

    const qty = new Prisma.Decimal(reservation.quantity.toString());

    return this.prisma.$transaction(async tx => {
      const lockedRow = await this.repository.findBalanceForUpdate(storeId, reservation.variantId, tx);
      if (!lockedRow) {
        throw new ConflictError('Unable to lock inventory balance for reservation release.');
      }

      const reserved = new Prisma.Decimal(lockedRow.quantity_reserved.toString());
      const newReserved = reserved.minus(qty).lessThan(0) ? new Prisma.Decimal(0) : reserved.minus(qty);

      const updatedReservation = await this.repository.updateReservation(
        reservation.id,
        {
          status: 'RELEASED',
        },
        tx
      );

      await this.repository.createMovement(
        {
          storeId,
          variantId: reservation.variantId,
          movementType: 'RESERVATION_RELEASED',
          quantityDelta: qty.negated(),
          quantityBefore: reserved,
          quantityAfter: newReserved,
          referenceType: 'STOCK_RESERVATION',
          referenceId: reservation.id,
          reason: 'Stock reservation released',
          performedByUserId,
        },
        tx
      );

      const updatedBalance = await this.repository.updateBalance(
        lockedRow.id,
        {
          quantityReserved: newReserved,
        },
        tx
      );

      return {
        reservation: this.serializeReservation(updatedReservation),
        balance: this.inventoryService.serializeBalance(updatedBalance),
      };
    });
  }

  /**
   * Fulfills an active reservation, simultaneously decrementing onHand and quantityReserved.
   */
  async fulfillReservation(
    storeId: string,
    reservationId: string,
    performedByUserId?: string
  ) {
    const reservation = await this.repository.findReservationById(reservationId);
    if (!reservation || reservation.storeId !== storeId) {
      throw new NotFoundError('Stock reservation not found at this store.');
    }

    if (reservation.status !== 'ACTIVE') {
      throw new ConflictError(
        `Cannot fulfill reservation in '${reservation.status}' status. Only ACTIVE reservations may be fulfilled.`
      );
    }

    const qty = new Prisma.Decimal(reservation.quantity.toString());

    return this.prisma.$transaction(async tx => {
      const lockedRow = await this.repository.findBalanceForUpdate(storeId, reservation.variantId, tx);
      if (!lockedRow) {
        throw new ConflictError('Unable to lock inventory balance for fulfillment.');
      }

      const onHand = new Prisma.Decimal(lockedRow.quantity_on_hand.toString());
      const reserved = new Prisma.Decimal(lockedRow.quantity_reserved.toString());

      if (onHand.lessThan(qty)) {
        throw new InsufficientStockError(
          `Cannot fulfill reservation: on-hand stock (${onHand.toFixed(4)}) is less than reserved amount (${qty.toFixed(4)}).`
        );
      }

      const newOnHand = onHand.minus(qty);
      const newReserved = reserved.minus(qty).lessThan(0) ? new Prisma.Decimal(0) : reserved.minus(qty);

      const updatedReservation = await this.repository.updateReservation(
        reservation.id,
        {
          status: 'FULFILLED',
        },
        tx
      );

      await this.repository.createMovement(
        {
          storeId,
          variantId: reservation.variantId,
          movementType: 'RESERVATION_FULFILLED',
          quantityDelta: qty.negated(),
          quantityBefore: onHand,
          quantityAfter: newOnHand,
          referenceType: 'STOCK_RESERVATION',
          referenceId: reservation.id,
          reason: 'Stock reservation fulfilled into completed order',
          performedByUserId,
        },
        tx
      );

      const updatedBalance = await this.repository.updateBalance(
        lockedRow.id,
        {
          quantityOnHand: newOnHand,
          quantityReserved: newReserved,
        },
        tx
      );

      return {
        reservation: this.serializeReservation(updatedReservation),
        balance: this.inventoryService.serializeBalance(updatedBalance),
      };
    });
  }
}
