import { Prisma } from '@prisma/client';

export const SALE_NUMBER_PREFIX = 'SAL';
export const RECEIPT_NUMBER_PREFIX = 'REC';

export const DEFAULT_CURRENCY = 'USD';
export const DEFAULT_TAX_RATE = new Prisma.Decimal('0.0000');

export const SALE_STATUSES = [
  'DRAFT',
  'PENDING_PAYMENT',
  'COMPLETED',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;

export type SaleStatusType = (typeof SALE_STATUSES)[number];

/**
 * Deterministic State Machine for Sale Lifecycle transitions.
 */
export const ALLOWED_SALE_TRANSITIONS: Record<SaleStatusType, readonly SaleStatusType[]> = {
  DRAFT: ['PENDING_PAYMENT', 'COMPLETED', 'CANCELLED'],
  PENDING_PAYMENT: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  PARTIALLY_REFUNDED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

/**
 * Checks if a transition between two sale statuses is permitted.
 */
export function isValidSaleTransition(from: SaleStatusType, to: SaleStatusType): boolean {
  if (from === to) return true;
  return ALLOWED_SALE_TRANSITIONS[from]?.includes(to) ?? false;
}
