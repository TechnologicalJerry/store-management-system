import { z } from 'zod';
import { REPORT_LIMITS, REPORT_TYPES } from './report.constants.js';

export const baseReportQuerySchema = z.object({
  storeId: z.string().uuid({ message: 'A valid storeId UUID is required' }),
  startDate: z
    .string()
    .datetime({ offset: true, message: 'startDate must be a valid ISO 8601 timestamp' })
    .optional(),
  endDate: z
    .string()
    .datetime({ offset: true, message: 'endDate must be a valid ISO 8601 timestamp' })
    .optional(),
});

export const salesSummaryQuerySchema = baseReportQuerySchema.extend({
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
});

export const topProductsQuerySchema = baseReportQuerySchema.extend({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(REPORT_LIMITS.MAX_TOP_PRODUCTS_LIMIT)
    .default(REPORT_LIMITS.DEFAULT_TOP_PRODUCTS_LIMIT),
});

export const paymentSummaryQuerySchema = baseReportQuerySchema.extend({
  paymentMethod: z.enum(['CASH', 'CARD', 'EXTERNAL_DIGITAL', 'STORE_CREDIT']).optional(),
});

export const inventorySummaryQuerySchema = z.object({
  storeId: z.string().uuid({ message: 'A valid storeId UUID is required' }),
  categoryId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(REPORT_LIMITS.MAX_PAGE_SIZE)
    .default(REPORT_LIMITS.DEFAULT_PAGE_SIZE),
});

export const lowStockQuerySchema = z.object({
  storeId: z.string().uuid({ message: 'A valid storeId UUID is required' }),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(REPORT_LIMITS.MAX_PAGE_SIZE)
    .default(REPORT_LIMITS.DEFAULT_PAGE_SIZE),
});

export const procurementSummaryQuerySchema = baseReportQuerySchema.extend({
  supplierId: z.string().uuid().optional(),
});

export const asyncReportRequestSchema = z.object({
  storeId: z.string().uuid({ message: 'A valid storeId UUID is required' }),
  reportType: z.enum([
    REPORT_TYPES.SALES_SUMMARY,
    REPORT_TYPES.TOP_PRODUCTS,
    REPORT_TYPES.PAYMENT_SUMMARY,
    REPORT_TYPES.INVENTORY_SUMMARY,
    REPORT_TYPES.LOW_STOCK,
    REPORT_TYPES.PROCUREMENT_SUMMARY,
  ]),
  parameters: z.record(z.unknown()).default({}),
});

export const reportIdParamsSchema = z.object({
  id: z.string().min(1, 'Report ID or report number is required'),
});

export type SalesSummaryQuery = z.infer<typeof salesSummaryQuerySchema>;
export type TopProductsQuery = z.infer<typeof topProductsQuerySchema>;
export type PaymentSummaryQuery = z.infer<typeof paymentSummaryQuerySchema>;
export type InventorySummaryQuery = z.infer<typeof inventorySummaryQuerySchema>;
export type LowStockQuery = z.infer<typeof lowStockQuerySchema>;
export type ProcurementSummaryQuery = z.infer<typeof procurementSummaryQuerySchema>;
export type AsyncReportRequestInput = z.infer<typeof asyncReportRequestSchema>;
export type ReportIdParams = z.infer<typeof reportIdParamsSchema>;
