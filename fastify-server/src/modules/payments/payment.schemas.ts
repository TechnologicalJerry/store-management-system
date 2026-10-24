import { z } from 'zod';
import { PAYMENT_METHODS, PAYMENT_STATUSES, REFUND_STATUSES } from './payment.constants.js';

export const decimalString = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, 'Must be a valid non-negative decimal string');

export const positiveDecimalString = z
  .string()
  .regex(/^(0*[1-9]\d*(\.\d+)?|0+\.\d*[1-9]\d*)$/, 'Must be a positive decimal number greater than 0');

export const recordPaymentSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS),
  amount: z.union([z.number().positive(), positiveDecimalString]).transform(val => String(val)),
  currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/).default('USD'),
  amountTendered: z
    .union([z.number().positive(), positiveDecimalString])
    .optional()
    .transform(val => (val !== undefined ? String(val) : undefined)),
  provider: z.string().max(50).optional(),
  providerTransactionId: z.string().max(100).optional(),
  idempotencyKey: z.string().max(100).optional(),
  notes: z.string().max(2000).optional(),
});

export const capturePaymentSchema = z.object({
  amount: z
    .union([z.number().positive(), positiveDecimalString])
    .optional()
    .transform(val => (val !== undefined ? String(val) : undefined)),
  idempotencyKey: z.string().max(100).optional(),
});

export const voidPaymentSchema = z.object({
  reason: z.string().min(3, 'Reason must be at least 3 characters long').max(255),
});

export const createRefundSchema = z.object({
  amount: z.union([z.number().positive(), positiveDecimalString]).transform(val => String(val)),
  reason: z.string().min(3, 'Reason must be at least 3 characters long').max(255),
  idempotencyKey: z.string().max(100).optional(),
});

export const paymentIdParamsSchema = z.object({
  paymentId: z.string().uuid('Invalid payment UUID format'),
});

export const refundIdParamsSchema = z.object({
  refundId: z.string().uuid('Invalid refund UUID format'),
});

export const paymentResponseSchema = z.object({
  id: z.string().uuid(),
  saleId: z.string().uuid(),
  paymentReference: z.string(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  status: z.enum(PAYMENT_STATUSES),
  amount: z.string(),
  currencyCode: z.string(),
  provider: z.string(),
  providerTransactionId: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  failureCode: z.string().nullable(),
  failureMessage: z.string().nullable(),
  changeDue: z.string().optional(),
  initiatedAt: z.string(),
  authorizedAt: z.string().nullable(),
  capturedAt: z.string().nullable(),
  failedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const refundResponseSchema = z.object({
  id: z.string().uuid(),
  paymentId: z.string().uuid(),
  saleId: z.string().uuid(),
  refundReference: z.string(),
  amount: z.string(),
  currencyCode: z.string(),
  status: z.enum(REFUND_STATUSES),
  reason: z.string(),
  providerRefundId: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  requestedByUserId: z.string().uuid().nullable(),
  processedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
