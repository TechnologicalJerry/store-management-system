import { AppError } from '../../common/errors/app-error.js';

export class SupplierNotFoundError extends AppError {
  constructor(message = 'Supplier not found.') {
    super(message, 404, 'SUPPLIER_NOT_FOUND');
  }
}

export class DuplicateSupplierCodeError extends AppError {
  constructor(message = 'A supplier with this unique code already exists.') {
    super(message, 409, 'DUPLICATE_SUPPLIER_CODE');
  }
}

export class InactiveSupplierError extends AppError {
  constructor(message = 'Cannot perform operation with an inactive or suspended supplier.') {
    super(message, 400, 'INACTIVE_SUPPLIER');
  }
}

export class SupplierProductNotFoundError extends AppError {
  constructor(message = 'Supplier product relationship not found.') {
    super(message, 404, 'SUPPLIER_PRODUCT_NOT_FOUND');
  }
}

export class DuplicateSupplierProductError extends AppError {
  constructor(message = 'This product variant is already registered with this supplier.') {
    super(message, 409, 'DUPLICATE_SUPPLIER_PRODUCT');
  }
}

export class SupplierHasOrdersError extends AppError {
  constructor(message = 'Cannot delete a supplier that has associated purchase orders.') {
    super(message, 409, 'SUPPLIER_HAS_ORDERS');
  }
}
