/**
 * Constants for Procurement and Purchase Order Management.
 */

import type { PurchaseOrderStatus } from './procurement.types.js';

export const PO_NUMBER_PREFIX = 'PO-';
export const RECEIPT_NUMBER_PREFIX = 'GR-';

/**
 * Valid lifecycle transitions for Purchase Orders.
 */
export const ALLOWED_PO_TRANSITIONS: Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['ORDERED', 'CANCELLED'],
  ORDERED: ['PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
  PARTIALLY_RECEIVED: ['RECEIVED'],
  RECEIVED: [],
  CANCELLED: [],
} as const;

/**
 * States from which a purchase order may be cancelled.
 * Note: If in ORDERED state, cancellation is only permitted if quantityReceived is zero.
 */
export const CANCELLABLE_PO_STATES: readonly PurchaseOrderStatus[] = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'ORDERED',
] as const;

/**
 * States in which purchase order line items and pricing can still be edited.
 */
export const EDITABLE_PO_STATES: readonly PurchaseOrderStatus[] = ['DRAFT'] as const;

/**
 * States that permit physical goods receipt.
 */
export const RECEIVABLE_PO_STATES: readonly PurchaseOrderStatus[] = [
  'ORDERED',
  'PARTIALLY_RECEIVED',
] as const;

export const PROCUREMENT_PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

export const DECIMAL_PLACES_MONEY = 2;
export const DECIMAL_PLACES_QTY = 4;
export const DEFAULT_CURRENCY = 'USD';
