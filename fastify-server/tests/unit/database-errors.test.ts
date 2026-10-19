import { describe, expect, it } from 'vitest';
import {
  isPrismaError,
  mapPrismaError,
} from '../../src/infrastructure/database/database.errors.js';

describe('Database Error Handling & Mapping (Unit)', () => {
  it('should identify Prisma error codes correctly with isPrismaError', () => {
    expect(isPrismaError({ code: 'P2002' })).toBe(true);
    expect(isPrismaError({ code: 'P2025' })).toBe(true);
    expect(isPrismaError({ code: 'P1001' })).toBe(true);
    expect(isPrismaError(new Error('Generic standard error'))).toBe(false);
    expect(isPrismaError(null)).toBe(false);
    expect(isPrismaError('P2002')).toBe(false);
  });

  it('should map P2002 unique constraint violation to ConflictError (409)', () => {
    const prismaError = {
      code: 'P2002',
      meta: { target: ['key'] },
      message: 'Unique constraint failed on the fields: (`key`)',
    };

    const mapped = mapPrismaError(prismaError);
    expect(mapped.statusCode).toBe(409);
    expect(mapped.code).toBe('UNIQUE_CONSTRAINT_VIOLATION');
    expect(mapped.message).toContain('unique key already exists');
    expect(mapped.details).toEqual({ field: 'key' });
  });

  it('should map P2025 record not found to NotFoundError (404)', () => {
    const prismaError = {
      code: 'P2025',
      message: 'An operation failed because it depends on one or more records that were required but not found.',
    };

    const mapped = mapPrismaError(prismaError);
    expect(mapped.statusCode).toBe(404);
    expect(mapped.code).toBe('NOT_FOUND');
    expect(mapped.message).toContain('not found');
  });

  it('should map P2003 foreign key violation to BadRequestError (400)', () => {
    const prismaError = {
      code: 'P2003',
      meta: { field_name: 'store_id' },
    };

    const mapped = mapPrismaError(prismaError);
    expect(mapped.statusCode).toBe(400);
    expect(mapped.code).toBe('FOREIGN_KEY_VIOLATION');
    expect(mapped.message).toContain('referenced entity does not exist');
  });

  it('should map P2024 pool connection timeout to ServiceUnavailableError (503)', () => {
    const prismaError = {
      code: 'P2024',
      message: 'Timed out fetching a new connection from the connection pool.',
    };

    const mapped = mapPrismaError(prismaError);
    expect(mapped.statusCode).toBe(503);
    expect(mapped.code).toBe('SERVICE_UNAVAILABLE');
    expect(mapped.message).toContain('connection pool timeout');
  });

  it('should map P1001 unreachable database to ServiceUnavailableError (503)', () => {
    const prismaError = {
      code: 'P1001',
      message: "Can't reach database server at `localhost:5432`",
    };

    const mapped = mapPrismaError(prismaError);
    expect(mapped.statusCode).toBe(503);
    expect(mapped.code).toBe('SERVICE_UNAVAILABLE');
    expect(mapped.message).toContain('Database service is currently unreachable');
    // Ensure raw hostname/port is not leaked to client
    expect(mapped.message).not.toContain('localhost:5432');
  });

  it('should map P2034 transaction write conflict to ConflictError (409)', () => {
    const prismaError = {
      code: 'P2034',
      message: 'Transaction failed due to a write conflict or a deadlock. Please retry your transaction.',
    };

    const mapped = mapPrismaError(prismaError);
    expect(mapped.statusCode).toBe(409);
    expect(mapped.code).toBe('TRANSACTION_WRITE_CONFLICT');
  });

  it('should sanitize unknown database errors into InternalServerError (500)', () => {
    const unknownDbError = {
      code: 'P9999',
      message: 'Internal engine panic on raw SQL SELECT * FROM secret_table',
    };

    const mapped = mapPrismaError(unknownDbError);
    expect(mapped.statusCode).toBe(500);
    expect(mapped.code).toBe('INTERNAL_SERVER_ERROR');
    expect(mapped.message).toBe('An unexpected database error occurred.');
    expect(mapped.message).not.toContain('secret_table');
  });
});
