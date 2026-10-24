import { AppError } from '../../common/errors/app-error.js';

export class PaymentNotFoundError extends AppError {
  constructor(identifier: string) {
    super(`Payment not found with identifier: ${identifier}`, 404, 'PAYMENT_NOT_FOUND');
  }
}

export class PaymentInvalidStateTransitionError extends AppError {
  constructor(currentStatus: string, targetStatus: string) {
    super(
      `Cannot transition payment from status '${currentStatus}' to '${targetStatus}'.`,
      409,
      'INVALID_PAYMENT_STATE_TRANSITION'
    );
  }
}

export class PaymentAmountExceedsSaleError extends AppError {
  constructor(paymentAmount: string, remainingDue: string) {
    super(
      `Payment amount (${paymentAmount}) exceeds the remaining balance due (${remainingDue}).`,
      422,
      'PAYMENT_AMOUNT_EXCEEDS_BALANCE'
    );
  }
}

export class RefundNotFoundError extends AppError {
  constructor(identifier: string) {
    super(`Refund not found with identifier: ${identifier}`, 404, 'REFUND_NOT_FOUND');
  }
}

export class RefundInvalidStateTransitionError extends AppError {
  constructor(currentStatus: string, targetStatus: string) {
    super(
      `Cannot transition refund from status '${currentStatus}' to '${targetStatus}'.`,
      409,
      'INVALID_REFUND_STATE_TRANSITION'
    );
  }
}

export class RefundAmountExceedsCapturedError extends AppError {
  constructor(requested: string, available: string) {
    super(
      `Refund amount (${requested}) exceeds available refundable balance (${available}).`,
      422,
      'REFUND_AMOUNT_EXCEEDS_CAPTURED'
    );
  }
}

export class PaymentProviderError extends AppError {
  constructor(message: string, code = 'PAYMENT_PROVIDER_ERROR') {
    super(`Payment provider error: ${message}`, 502, code);
  }
}

export class PaymentAlreadyCapturedError extends AppError {
  constructor(reference: string) {
    super(`Payment '${reference}' is already captured and cannot be re-captured.`, 409, 'PAYMENT_ALREADY_CAPTURED');
  }
}
