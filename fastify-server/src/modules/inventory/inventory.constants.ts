/**
 * Inventory Module Constants
 */

export const INVENTORY_CONSTANTS = {
  DEFAULT_REORDER_LEVEL: '10.0000',
  DEFAULT_DECIMAL_SCALE: 4,
  MAX_PAGE_LIMIT: 100,
  DEFAULT_PAGE_LIMIT: 20,
  TRANSFER_NUMBER_PREFIX: 'TRF',
} as const;

export const INVENTORY_REFERENCE_TYPES = {
  STOCK_RECEIPT: 'STOCK_RECEIPT',
  MANUAL_ADJUSTMENT: 'MANUAL_ADJUSTMENT',
  TRANSFER: 'TRANSFER',
  STOCK_RESERVATION: 'STOCK_RESERVATION',
  SALE: 'SALE',
  RETURN: 'RETURN',
} as const;

export const INVENTORY_DEFAULT_REASONS = {
  OPENING_STOCK: 'Initial store inventory opening balance',
  STOCK_RECEIVED: 'Inbound stock receiving',
  RECOUNT_SURPLUS: 'Inventory count surplus correction',
  DAMAGED_WRITE_OFF: 'Damaged or expired inventory write-off',
  THEFT_OR_LOSS: 'Inventory shrinkage or discrepancy write-off',
  TRANSFER_OUTBOUND: 'Inter-store transfer shipment outbound',
  TRANSFER_INBOUND: 'Inter-store transfer receiving inbound',
  RESERVATION_HOLD: 'Customer order stock reservation hold',
} as const;
