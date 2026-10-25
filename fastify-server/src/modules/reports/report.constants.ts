/**
 * Report Constants & Default Configurations
 *
 * Enforces bounded date windows, pagination constraints, and timezone conventions.
 */

export const REPORT_TIMEZONE_DEFAULT = 'UTC';

export const REPORT_LIMITS = {
  DEFAULT_LOOKBACK_DAYS: 30,
  MAX_SYNC_DATE_RANGE_DAYS: 90,
  MAX_ASYNC_DATE_RANGE_DAYS: 366,
  DEFAULT_TOP_PRODUCTS_LIMIT: 10,
  MAX_TOP_PRODUCTS_LIMIT: 50,
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 200,
} as const;

export const REPORT_TYPES = {
  SALES_SUMMARY: 'SALES_SUMMARY',
  TOP_PRODUCTS: 'TOP_PRODUCTS',
  PAYMENT_SUMMARY: 'PAYMENT_SUMMARY',
  INVENTORY_SUMMARY: 'INVENTORY_SUMMARY',
  LOW_STOCK: 'LOW_STOCK',
  PROCUREMENT_SUMMARY: 'PROCUREMENT_SUMMARY',
} as const;

export type ReportTypeConst = (typeof REPORT_TYPES)[keyof typeof REPORT_TYPES];

export const REPORT_STATUS = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;
