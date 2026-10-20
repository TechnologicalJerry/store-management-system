import { describe, expect, it } from 'vitest';
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  InternalServerError,
  NotFoundError,
  PayloadTooLargeError,
  ServiceUnavailableError,
  TooManyRequestsError,
  UnauthorizedError,
  ValidationError,
} from '../../src/common/errors/app-error.js';

describe('AppError Hierarchy (Unit)', () => {
  it('should instantiate AppError with default operational attributes', () => {
    const error = new AppError('Something failed', 500, 'INTERNAL_SERVER_ERROR');
    expect(error.message).toBe('Something failed');
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(error.isOperational).toBe(true);
    expect(error.stack).toBeDefined();
  });

  it('should instantiate BadRequestError with 400', () => {
    const error = new BadRequestError('Malformed input', { field: 'name' });
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.message).toBe('Malformed input');
    expect(error.details).toEqual({ field: 'name' });
  });

  it('should instantiate ValidationError with 400 and VALIDATION_ERROR code', () => {
    const error = new ValidationError('Invalid email address');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('Invalid email address');
  });

  it('should instantiate UnauthorizedError with 401', () => {
    const error = new UnauthorizedError();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('should instantiate ForbiddenError with 403', () => {
    const error = new ForbiddenError();
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });

  it('should instantiate NotFoundError with 404', () => {
    const error = new NotFoundError('Store not found');
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('Store not found');
  });

  it('should instantiate ConflictError with 409', () => {
    const error = new ConflictError('SKU already exists');
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
  });

  it('should instantiate PayloadTooLargeError with 413', () => {
    const error = new PayloadTooLargeError();
    expect(error.statusCode).toBe(413);
    expect(error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('should instantiate TooManyRequestsError with 429', () => {
    const error = new TooManyRequestsError();
    expect(error.statusCode).toBe(429);
    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('should instantiate InternalServerError with 500 and non-operational flag', () => {
    const error = new InternalServerError();
    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(error.isOperational).toBe(false);
  });

  it('should instantiate ServiceUnavailableError with 503', () => {
    const error = new ServiceUnavailableError();
    expect(error.statusCode).toBe(503);
    expect(error.code).toBe('SERVICE_UNAVAILABLE');
  });
});
