import { AppError } from '../../common/errors/app-error.js';

export class SaleNotFoundError extends AppError {
  constructor(identifier: string) {
    super(`Sale not found with identifier: ${identifier}`, 404, 'SALE_NOT_FOUND');
  }
}

export class SaleInvalidStateTransitionError extends AppError {
  constructor(currentStatus: string, targetStatus: string) {
    super(
      `Cannot transition sale from status '${currentStatus}' to '${targetStatus}'.`,
      409,
      'INVALID_SALE_STATE_TRANSITION'
    );
  }
}

export class SaleAlreadyCompletedError extends AppError {
  constructor(saleNumber: string) {
    super(
      `Sale '${saleNumber}' is already completed and cannot be modified.`,
      409,
      'SALE_ALREADY_COMPLETED'
    );
  }
}

export class SaleItemInvalidError extends AppError {
  constructor(message: string) {
    super(message, 422, 'SALE_ITEM_INVALID');
  }
}

export class SaleInsufficientStockError extends AppError {
  constructor(sku: string, requested: string, available: string) {
    super(
      `Insufficient available stock for variant SKU '${sku}'. Requested: ${requested}, Available: ${available}.`,
      409,
      'INSUFFICIENT_STOCK'
    );
  }
}

export class ReceiptNotFoundError extends AppError {
  constructor(identifier: string) {
    super(`Receipt not found for identifier: ${identifier}`, 404, 'RECEIPT_NOT_FOUND');
  }
}

export class SalePriceMismatchError extends AppError {
  constructor(message: string) {
    super(message, 422, 'SALE_PRICE_MISMATCH');
  }
}

export class SaleCurrencyMismatchError extends AppError {
  constructor(expected: string, received: string) {
    super(
      `Currency mismatch: Sale currency is '${expected}', but item/payment is '${received}'.`,
      422,
      'CURRENCY_MISMATCH'
    );
  }
}
