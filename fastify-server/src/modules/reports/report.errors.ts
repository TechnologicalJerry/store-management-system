import { BadRequestError, NotFoundError, ForbiddenError } from '../../common/errors/app-error.js';

export class InvalidDateRangeError extends BadRequestError {
  constructor(message = 'Invalid report date range specified. End date must be on or after start date.') {
    super(message, undefined, 'INVALID_DATE_RANGE');
  }
}

export class ReportDateRangeExceededError extends BadRequestError {
  constructor(maxDays: number) {
    super(
      `Synchronous report date range exceeds maximum allowed limit of ${maxDays} days. Please use async report generation for larger intervals.`,
      { maxDays },
      'DATE_RANGE_EXCEEDED'
    );
  }
}

export class ReportNotFoundError extends NotFoundError {
  constructor(reportIdOrNumber: string) {
    super(`Report request '${reportIdOrNumber}' not found.`, { reportIdOrNumber });
  }
}

export class ReportAccessDeniedError extends ForbiddenError {
  constructor(message = 'Access denied: You do not have permission to view reports for this store.') {
    super(message);
  }
}
