import { z } from 'zod';
import { SALE_STATUSES } from './sale.constants.js';

export const decimalString = z
  .string()
  .regex(/^\d+(\.\d{1,4})?$/, 'Must be a valid non-negative decimal string');

export const positiveDecimalString = z
  .string()
  .regex(/^(0*[1-9]\d*(\.\d+)?|0+\.\d*[1-9]\d*)$/, 'Must be a positive decimal number greater than 0');

export const currencyCodeSchema = z
  .string()
  .length(3, 'Currency code must be exactly 3 uppercase letters')
  .regex(/^[A-Z]{3}$/, 'Currency code must consist of uppercase alphabetic characters');

export const saleItemInputSchema = z.object({
  variantId: z.string().uuid('Invalid variant UUID format'),
  quantity: z.union([z.number().positive(), positiveDecimalString]).transform(val => String(val)),
  discountAmount: z
    .union([z.number().nonnegative(), decimalString])
    .optional()
    .transform(val => (val !== undefined ? String(val) : '0.00')),
});

export const createSaleSchema = z.object({
  storeId: z.string().uuid('Invalid store UUID format'),
  currencyCode: currencyCodeSchema.default('USD'),
  notes: z.string().max(2000).optional(),
  idempotencyKey: z.string().max(100).optional(),
  items: z.array(saleItemInputSchema).min(1, 'Sale must contain at least one item'),
});

export const directCheckoutSchema = z.object({
  storeId: z.string().uuid('Invalid store UUID format'),
  currencyCode: currencyCodeSchema.default('USD'),
  notes: z.string().max(2000).optional(),
  idempotencyKey: z.string().max(100).optional(),
  items: z.array(saleItemInputSchema).min(1, 'Sale must contain at least one item'),
  paymentMethod: z.enum(['CASH', 'CARD', 'EXTERNAL_DIGITAL', 'STORE_CREDIT']),
  amountTendered: z
    .union([z.number().positive(), positiveDecimalString])
    .optional()
    .transform(val => (val !== undefined ? String(val) : undefined)),
  provider: z.string().max(50).optional(),
  providerTransactionId: z.string().max(100).optional(),
});

export const completeCheckoutSchema = z.object({
  paymentMethod: z.enum(['CASH', 'CARD', 'EXTERNAL_DIGITAL', 'STORE_CREDIT']),
  amountTendered: z
    .union([z.number().positive(), positiveDecimalString])
    .optional()
    .transform(val => (val !== undefined ? String(val) : undefined)),
  provider: z.string().max(50).optional(),
  providerTransactionId: z.string().max(100).optional(),
  idempotencyKey: z.string().max(100).optional(),
});

export const cancelSaleSchema = z.object({
  reason: z.string().min(3, 'Reason must be at least 3 characters long').max(255),
});

export const saleQuerySchema = z.object({
  storeId: z.string().uuid('Invalid store UUID format').optional(),
  status: z.enum(SALE_STATUSES).optional(),
  cashierUserId: z.string().uuid('Invalid cashier user UUID format').optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  search: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const saleIdParamsSchema = z.object({
  saleId: z.string().uuid('Invalid sale UUID format'),
});

export const receiptIdParamsSchema = z.object({
  receiptId: z.string().uuid('Invalid receipt UUID format'),
});

export const saleItemResponseSchema = z.object({
  id: z.string().uuid(),
  saleId: z.string().uuid(),
  variantId: z.string().uuid(),
  skuSnapshot: z.string(),
  productNameSnapshot: z.string(),
  variantNameSnapshot: z.string().nullable(),
  quantity: z.string(),
  unitPrice: z.string(),
  discountAmount: z.string(),
  taxRate: z.string(),
  taxAmount: z.string(),
  lineTotal: z.string(),
  createdAt: z.string(),
});

export const saleResponseSchema = z.object({
  id: z.string().uuid(),
  saleNumber: z.string(),
  storeId: z.string().uuid(),
  status: z.enum(SALE_STATUSES),
  currencyCode: z.string(),
  subtotal: z.string(),
  discountTotal: z.string(),
  taxTotal: z.string(),
  grandTotal: z.string(),
  amountPaid: z.string(),
  amountRefunded: z.string(),
  changeDue: z.string().optional(),
  cashierUserId: z.string().uuid().nullable(),
  idempotencyKey: z.string().nullable(),
  notes: z.string().nullable(),
  completedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  items: z.array(saleItemResponseSchema).optional(),
});
