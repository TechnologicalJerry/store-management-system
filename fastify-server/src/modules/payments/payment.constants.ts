export const PAYMENT_REF_PREFIX = 'PAY';
export const REFUND_REF_PREFIX = 'REF';

export const PAYMENT_METHODS = [
  'CASH',
  'CARD',
  'EXTERNAL_DIGITAL',
  'STORE_CREDIT',
] as const;

export type PaymentMethodType = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = [
  'PENDING',
  'REQUIRES_ACTION',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;

export type PaymentStatusType = (typeof PAYMENT_STATUSES)[number];

export const REFUND_STATUSES = [
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
] as const;

export type RefundStatusType = (typeof REFUND_STATUSES)[number];

/**
 * Deterministic State Machine for Payment transitions.
 */
export const ALLOWED_PAYMENT_TRANSITIONS: Record<PaymentStatusType, readonly PaymentStatusType[]> = {
  PENDING: ['AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED', 'REQUIRES_ACTION'],
  REQUIRES_ACTION: ['AUTHORIZED', 'CAPTURED', 'FAILED', 'CANCELLED'],
  AUTHORIZED: ['CAPTURED', 'CANCELLED'],
  CAPTURED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  PARTIALLY_REFUNDED: ['REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function isValidPaymentTransition(from: PaymentStatusType, to: PaymentStatusType): boolean {
  if (from === to) return true;
  return ALLOWED_PAYMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Deterministic State Machine for Refund transitions.
 */
export const ALLOWED_REFUND_TRANSITIONS: Record<RefundStatusType, readonly RefundStatusType[]> = {
  PENDING: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
  SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
};

export function isValidRefundTransition(from: RefundStatusType, to: RefundStatusType): boolean {
  if (from === to) return true;
  return ALLOWED_REFUND_TRANSITIONS[from]?.includes(to) ?? false;
}
