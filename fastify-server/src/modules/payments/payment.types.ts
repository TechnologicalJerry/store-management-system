import type {
  PaymentMethodType,
  PaymentStatusType,
  RefundStatusType,
} from './payment.constants.js';

export interface RecordPaymentDto {
  saleId: string;
  paymentMethod: PaymentMethodType;
  amount: string | number;
  currencyCode?: string;
  amountTendered?: string | number;
  provider?: string;
  providerTransactionId?: string;
  idempotencyKey?: string;
  notes?: string;
}

export interface CapturePaymentDto {
  amount?: string | number;
  idempotencyKey?: string;
}

export interface VoidPaymentDto {
  reason: string;
}

export interface CreateRefundDto {
  paymentId: string;
  amount: string | number;
  reason: string;
  idempotencyKey?: string;
}

export interface PaymentResponseDto {
  id: string;
  saleId: string;
  paymentReference: string;
  paymentMethod: PaymentMethodType;
  status: PaymentStatusType;
  amount: string;
  currencyCode: string;
  provider: string;
  providerTransactionId: string | null;
  idempotencyKey: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  changeDue?: string;
  initiatedAt: string;
  authorizedAt: string | null;
  capturedAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
  refunds?: RefundResponseDto[];
}

export interface RefundResponseDto {
  id: string;
  paymentId: string;
  saleId: string;
  refundReference: string;
  amount: string;
  currencyCode: string;
  status: RefundStatusType;
  reason: string;
  providerRefundId: string | null;
  idempotencyKey: string | null;
  requestedByUserId: string | null;
  processedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
