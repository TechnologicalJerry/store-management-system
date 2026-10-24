import { describe, expect, it } from 'vitest';
import {
  ALLOWED_SALE_TRANSITIONS,
  isValidSaleTransition,
  type SaleStatusType,
} from '../../src/modules/sales/sale.constants.js';
import {
  ALLOWED_PAYMENT_TRANSITIONS,
  isValidPaymentTransition,
  ALLOWED_REFUND_TRANSITIONS,
  isValidRefundTransition,
  type PaymentStatusType,
  type RefundStatusType,
} from '../../src/modules/payments/payment.constants.js';

describe('Sales & Payment State Machines (Unit)', () => {
  describe('Sale State Machine', () => {
    it('allows identical status transition (idempotent)', () => {
      expect(isValidSaleTransition('DRAFT', 'DRAFT')).toBe(true);
      expect(isValidSaleTransition('COMPLETED', 'COMPLETED')).toBe(true);
    });

    it('allows valid forward transitions from DRAFT', () => {
      expect(isValidSaleTransition('DRAFT', 'PENDING_PAYMENT')).toBe(true);
      expect(isValidSaleTransition('DRAFT', 'COMPLETED')).toBe(true);
      expect(isValidSaleTransition('DRAFT', 'CANCELLED')).toBe(true);
    });

    it('allows transitions from PENDING_PAYMENT to COMPLETED or CANCELLED', () => {
      expect(isValidSaleTransition('PENDING_PAYMENT', 'COMPLETED')).toBe(true);
      expect(isValidSaleTransition('PENDING_PAYMENT', 'CANCELLED')).toBe(true);
    });

    it('allows refunds from COMPLETED', () => {
      expect(isValidSaleTransition('COMPLETED', 'PARTIALLY_REFUNDED')).toBe(true);
      expect(isValidSaleTransition('COMPLETED', 'REFUNDED')).toBe(true);
    });

    it('disallows invalid transitions', () => {
      expect(isValidSaleTransition('COMPLETED', 'DRAFT')).toBe(false);
      expect(isValidSaleTransition('COMPLETED', 'CANCELLED')).toBe(false);
      expect(isValidSaleTransition('CANCELLED', 'COMPLETED')).toBe(false);
      expect(isValidSaleTransition('REFUNDED', 'DRAFT')).toBe(false);
    });
  });

  describe('Payment State Machine', () => {
    it('allows valid transitions from PENDING', () => {
      expect(isValidPaymentTransition('PENDING', 'AUTHORIZED')).toBe(true);
      expect(isValidPaymentTransition('PENDING', 'CAPTURED')).toBe(true);
      expect(isValidPaymentTransition('PENDING', 'FAILED')).toBe(true);
      expect(isValidPaymentTransition('PENDING', 'CANCELLED')).toBe(true);
    });

    it('allows capture or void from AUTHORIZED', () => {
      expect(isValidPaymentTransition('AUTHORIZED', 'CAPTURED')).toBe(true);
      expect(isValidPaymentTransition('AUTHORIZED', 'CANCELLED')).toBe(true);
    });

    it('allows refunds from CAPTURED', () => {
      expect(isValidPaymentTransition('CAPTURED', 'PARTIALLY_REFUNDED')).toBe(true);
      expect(isValidPaymentTransition('CAPTURED', 'REFUNDED')).toBe(true);
    });

    it('disallows transitions from terminal states', () => {
      expect(isValidPaymentTransition('FAILED', 'CAPTURED')).toBe(false);
      expect(isValidPaymentTransition('CANCELLED', 'AUTHORIZED')).toBe(false);
      expect(isValidPaymentTransition('REFUNDED', 'PENDING')).toBe(false);
    });
  });

  describe('Refund State Machine', () => {
    it('allows valid transitions from PENDING refund', () => {
      expect(isValidRefundTransition('PENDING', 'SUCCEEDED')).toBe(true);
      expect(isValidRefundTransition('PENDING', 'FAILED')).toBe(true);
      expect(isValidRefundTransition('PENDING', 'CANCELLED')).toBe(true);
    });

    it('disallows modifications once SUCCEEDED or FAILED', () => {
      expect(isValidRefundTransition('SUCCEEDED', 'PENDING')).toBe(false);
      expect(isValidRefundTransition('FAILED', 'SUCCEEDED')).toBe(false);
    });
  });
});
