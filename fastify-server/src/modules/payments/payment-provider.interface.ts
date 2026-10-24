import { Prisma } from '@prisma/client';

export interface PaymentProcessParams {
  paymentReference: string;
  paymentMethod: string;
  currencyCode: string;
  idempotencyKey?: string;
  amountTendered?: Prisma.Decimal;
  metadata?: Record<string, unknown>;
}

export interface PaymentResult {
  success: boolean;
  status: 'CAPTURED' | 'AUTHORIZED' | 'PENDING' | 'FAILED' | 'REQUIRES_ACTION';
  providerTransactionId?: string;
  failureCode?: string;
  failureMessage?: string;
  sanitizedMetadata?: Record<string, unknown>;
}

export interface RefundResult {
  success: boolean;
  status: 'SUCCEEDED' | 'FAILED' | 'PENDING';
  providerRefundId?: string;
  failureCode?: string;
  failureMessage?: string;
  sanitizedMetadata?: Record<string, unknown>;
}

export interface IPaymentProvider {
  readonly providerName: string;

  /**
   * Processes a payment attempt.
   */
  processPayment(
    amount: Prisma.Decimal,
    currencyCode: string,
    params: PaymentProcessParams
  ): Promise<PaymentResult>;

  /**
   * Captures an authorized payment.
   */
  capturePayment?(
    providerTransactionId: string,
    amount: Prisma.Decimal,
    currencyCode: string
  ): Promise<PaymentResult>;

  /**
   * Voids an authorized, uncaptured payment.
   */
  voidPayment?(
    providerTransactionId: string,
    reason?: string
  ): Promise<PaymentResult>;

  /**
   * Processes a refund against a captured payment.
   */
  processRefund(
    providerTransactionId: string,
    amount: Prisma.Decimal,
    currencyCode: string,
    reason: string
  ): Promise<RefundResult>;
}
