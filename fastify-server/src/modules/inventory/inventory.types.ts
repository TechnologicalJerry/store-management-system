import type { PaginationParams } from '../../common/types/pagination.js';

export type MovementType =
  | 'OPENING_STOCK'
  | 'STOCK_RECEIVED'
  | 'ADJUSTMENT_INCREASE'
  | 'ADJUSTMENT_DECREASE'
  | 'SALE'
  | 'RETURN'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'RESERVATION_CREATED'
  | 'RESERVATION_RELEASED'
  | 'RESERVATION_FULFILLED';

export type ReservationStatus =
  | 'ACTIVE'
  | 'RELEASED'
  | 'FULFILLED'
  | 'EXPIRED'
  | 'CANCELLED';

export type TransferStatus =
  | 'DRAFT'
  | 'REQUESTED'
  | 'APPROVED'
  | 'SHIPPED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

/**
 * Clean domain DTO for inventory balance with derived available quantity.
 */
export interface InventoryBalanceResponseDto {
  id: string;
  storeId: string;
  variantId: string;
  quantityOnHand: string;
  quantityReserved: string;
  quantityAvailable: string;
  reorderLevel: string;
  isLowStock: boolean;
  store?: {
    id: string;
    name: string;
    code: string;
  };
  variant?: {
    id: string;
    productId: string;
    name: string;
    sku: string;
    barcode?: string | null;
    price: string;
    product?: {
      id: string;
      name: string;
      slug: string;
    };
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Clean domain DTO for immutable inventory movements.
 */
export interface InventoryMovementResponseDto {
  id: string;
  storeId: string;
  variantId: string;
  movementType: MovementType;
  quantityDelta: string;
  quantityBefore: string;
  quantityAfter: string;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string | null;
  reason: string | null;
  notes: string | null;
  performedByUserId: string | null;
  performedByUser?: {
    id: string;
    name: string;
    email: string;
  } | null;
  createdAt: string;
}

/**
 * Clean domain DTO for stock reservations.
 */
export interface StockReservationResponseDto {
  id: string;
  storeId: string;
  variantId: string;
  quantity: string;
  status: ReservationStatus;
  referenceType: string | null;
  referenceId: string | null;
  expiresAt: string | null;
  createdByUserId: string | null;
  createdByUser?: {
    id: string;
    name: string;
    email: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Clean domain DTO for transfer items.
 */
export interface InventoryTransferItemResponseDto {
  id: string;
  transferId: string;
  variantId: string;
  quantityRequested: string;
  quantityShipped: string;
  quantityReceived: string;
  notes: string | null;
  variant?: {
    id: string;
    productId: string;
    name: string;
    sku: string;
    barcode?: string | null;
    product?: {
      id: string;
      name: string;
      slug: string;
    };
  };
  createdAt: string;
  updatedAt: string;
}

/**
 * Clean domain DTO for inter-store transfers.
 */
export interface InventoryTransferResponseDto {
  id: string;
  transferNumber: string;
  sourceStoreId: string;
  destinationStoreId: string;
  status: TransferStatus;
  notes: string | null;
  sourceStore?: {
    id: string;
    name: string;
    code: string;
  };
  destinationStore?: {
    id: string;
    name: string;
    code: string;
  };
  items: InventoryTransferItemResponseDto[];
  createdByUserId: string | null;
  approvedByUserId: string | null;
  shippedByUserId: string | null;
  receivedByUserId: string | null;
  shippedAt: string | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Payload for receiving new stock.
 */
export interface ReceiveStockDto {
  variantId: string;
  quantity: number | string;
  reason?: string;
  notes?: string;
  referenceType?: string;
  referenceId?: string;
  idempotencyKey?: string;
}

/**
 * Payload for manual stock adjustment.
 */
export interface AdjustStockDto {
  variantId: string;
  adjustmentType: 'INCREASE' | 'DECREASE';
  quantity: number | string;
  reason: string;
  notes?: string;
  idempotencyKey?: string;
}

/**
 * Payload for creating stock reservation.
 */
export interface CreateReservationDto {
  variantId: string;
  quantity: number | string;
  referenceType?: string;
  referenceId?: string;
  expiresAt?: string;
}

/**
 * Item entry in transfer creation.
 */
export interface CreateTransferItemDto {
  variantId: string;
  quantityRequested: number | string;
  notes?: string;
}

/**
 * Payload for creating an inter-store transfer.
 */
export interface CreateTransferDto {
  sourceStoreId: string;
  destinationStoreId: string;
  notes?: string;
  items: CreateTransferItemDto[];
}

/**
 * Payload for confirming shipment of a transfer.
 */
export interface ShipTransferDto {
  items?: Array<{
    variantId: string;
    quantityShipped: number | string;
  }>;
}

/**
 * Payload for confirming receipt of a transfer.
 */
export interface ReceiveTransferDto {
  notes?: string;
  items?: Array<{
    variantId: string;
    quantityReceived: number | string;
    notes?: string;
  }>;
}

/**
 * Query filters for store inventory list.
 */
export interface InventoryQueryDto extends PaginationParams {
  search?: string;
  categoryId?: string;
  lowStockOnly?: boolean;
}

/**
 * Query filters for low-stock items.
 */
export interface LowStockQueryDto extends PaginationParams {
  categoryId?: string;
}

/**
 * Query filters for movement history.
 */
export interface MovementQueryDto extends PaginationParams {
  variantId?: string;
  movementType?: MovementType;
  referenceType?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Query filters for transfers.
 */
export interface TransferQueryDto extends PaginationParams {
  sourceStoreId?: string;
  destinationStoreId?: string;
  status?: TransferStatus;
}
