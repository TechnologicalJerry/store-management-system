/**
 * Constants for Supplier Management module.
 */

export const SUPPLIER_PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
} as const;

export const SUPPLIER_SORT_FIELDS = [
  'name',
  'code',
  'status',
  'createdAt',
  'updatedAt',
] as const;

export const SUPPLIER_PRODUCT_SORT_FIELDS = [
  'createdAt',
  'purchasePrice',
  'minimumOrderQuantity',
  'status',
] as const;

export const DEFAULT_CURRENCY = 'USD';
