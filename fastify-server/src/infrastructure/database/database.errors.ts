import { Prisma } from '@prisma/client';
import {
  AppError,
  BadRequestError,
  ConflictError,
  InternalServerError,
  NotFoundError,
  ServiceUnavailableError,
} from '../../common/errors/app-error.js';

/**
 * Checks if an error is an instance of PrismaClientKnownRequestError or contains a Prisma error code.
 */
export function isPrismaError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return true;
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return true;
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return true;
  }
  if (error instanceof Prisma.PrismaClientRustPanicError) {
    return true;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string' &&
    (error as { code: string }).code.startsWith('P')
  ) {
    return true;
  }
  return false;
}

/**
 * Maps known Prisma database error codes to safe, RFC-compliant application domain errors.
 * Sanitizes table names, connection strings, and internal SQL statements from the client response.
 */
export function mapPrismaError(error: unknown): AppError {
  if (error instanceof Prisma.PrismaClientKnownRequestError || (typeof error === 'object' && error !== null && 'code' in error)) {
    const code = (error as { code?: string }).code;
    const meta = (error as { meta?: Record<string, unknown> }).meta;

    switch (code) {
      case 'P2002': {
        // Unique constraint violation
        const target = Array.isArray(meta?.['target'])
          ? (meta?.['target'] as string[]).join(', ')
          : typeof meta?.['target'] === 'string'
            ? meta['target']
            : 'field';
        return new ConflictError(
          `A resource with the specified unique ${target} already exists.`,
          { field: target },
          'UNIQUE_CONSTRAINT_VIOLATION'
        );
      }

      case 'P2025': {
        // Record to update or delete not found
        return new NotFoundError('The requested record was not found or has been removed.');
      }

      case 'P2003': {
        // Foreign key constraint failed
        return new BadRequestError(
          'Operation failed because a referenced entity does not exist or has dependent records.',
          undefined,
          'FOREIGN_KEY_VIOLATION'
        );
      }

      case 'P2024': {
        // Timed out fetching a new connection from the pool
        return new ServiceUnavailableError(
          'Database connection pool timeout. Please retry the request shortly.',
          undefined
        );
      }

      case 'P2034': {
        // Transaction failed due to a write conflict or deadlock
        return new ConflictError(
          'Transaction could not be completed due to a concurrent write conflict. Please retry.',
          undefined,
          'TRANSACTION_WRITE_CONFLICT'
        );
      }

      case 'P1000':
      case 'P1001':
      case 'P1002':
      case 'P1003':
      case 'P1008': {
        // Database connectivity / unreachable errors
        return new ServiceUnavailableError(
          'Database service is currently unreachable. Please try again later.'
        );
      }

      default:
        break;
    }
  }

  if (error instanceof Prisma.PrismaClientValidationError) {
    return new BadRequestError('Invalid database query parameters or payload structure.');
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return new ServiceUnavailableError('Database service initialization failed.');
  }

  // Fallback for generic or unknown database errors
  return new InternalServerError('An unexpected database error occurred.');
}
