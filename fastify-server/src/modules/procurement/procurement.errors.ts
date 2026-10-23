import { AppError } from '../../common/errors/app-error.js';

export class PurchaseOrderNotFoundError extends AppError {
  constructor(message = 'Purchase order not found.') {
    super(message, 404, 'PURCHASE_ORDER_NOT_FOUND');
  }
}

export class InvalidPurchaseOrderStateError extends AppError {
  constructor(message = 'The requested operation is not allowed in the current purchase order state.') {
    super(message, 409, 'INVALID_PURCHASE_ORDER_STATE');
  }
}

export class PurchaseOrderImmutableError extends AppError {
  constructor(message = 'Purchase order lines and pricing cannot be modified once submitted or ordered.') {
    super(message, 409, 'PURCHASE_ORDER_IMMUTABLE');
  }
}

export class GoodsReceiptNotFoundError extends AppError {
  constructor(message = 'Goods receipt not found.') {
    super(message, 404, 'GOODS_RECEIPT_NOT_FOUND');
  }
}

export class SeparationOfDutiesError extends AppError {
  constructor(message = 'Separation of duties violation: Creators cannot approve their own purchase orders.') {
    super(message, 403, 'SEPARATION_OF_DUTIES_VIOLATION');
  }
}

export class DuplicateReceiptIdempotencyError extends AppError {
  constructor(message = 'A goods receipt with this idempotency key has already been processed with different parameters.') {
    super(message, 409, 'DUPLICATE_RECEIPT_IDEMPOTENCY_KEY');
  }
}

export class InvalidReceivedQuantityError extends AppError {
  constructor(message = 'Invalid delivery quantities: accepted plus rejected must equal delivered quantity, and accepted quantity cannot exceed remaining outstanding order quantity.') {
    super(message, 400, 'INVALID_RECEIVED_QUANTITY');
  }
}

export class InactiveSupplierForOrderError extends AppError {
  constructor(message = 'Cannot create purchase orders for inactive or suspended suppliers.') {
    super(message, 400, 'INACTIVE_SUPPLIER_FOR_ORDER');
  }
}

export class InactiveStoreForOrderError extends AppError {
  constructor(message = 'Cannot designate an inactive or suspended store as order destination.') {
    super(message, 400, 'INACTIVE_STORE_FOR_ORDER');
  }
}

export class EmptyPurchaseOrderItemsError extends AppError {
  constructor(message = 'Purchase order must contain at least one line item.') {
    super(message, 400, 'EMPTY_PURCHASE_ORDER_ITEMS');
  }
}
