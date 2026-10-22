import { BadRequestError, ConflictError } from '../../common/errors/app-error.js';

/**
 * Thrown when an inventory operation requires more available stock than currently on hand.
 */
export class InsufficientStockError extends BadRequestError {
  constructor(message = 'Insufficient available stock for this operation.', details?: unknown) {
    super(message, details, 'INSUFFICIENT_STOCK');
  }
}

/**
 * Thrown when an inventory transfer transition is not permitted by the state machine.
 */
export class InvalidTransferStateError extends ConflictError {
  constructor(message = 'Invalid transfer state transition.', details?: unknown) {
    super(message, details, 'INVALID_TRANSFER_STATE');
  }
}

/**
 * Thrown when an idempotency key is reused with a differing payload or mismatched parameters.
 */
export class DuplicateIdempotencyKeyError extends ConflictError {
  constructor(
    message = 'Idempotency key has already been used with different request parameters.',
    details?: unknown
  ) {
    super(message, details, 'DUPLICATE_IDEMPOTENCY_KEY');
  }
}

/**
 * Thrown when high concurrency or serialization conflict prevents atomic stock modification.
 */
export class InventoryConcurrencyError extends ConflictError {
  constructor(
    message = 'Concurrent modification conflict encountered on inventory balance. Please retry.',
    details?: unknown
  ) {
    super(message, details, 'INVENTORY_CONCURRENCY_CONFLICT');
  }
}
