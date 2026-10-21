import type { PaginatedResult, PaginationMeta, PaginationParams } from '../types/pagination.js';

export interface ParsePaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
  defaultSortBy?: string;
  defaultSortOrder?: 'asc' | 'desc';
}

/**
 * Parses raw query parameters into validated pagination parameters and Prisma skip/take offsets.
 */
export function parsePagination(
  query: Record<string, unknown>,
  options: ParsePaginationOptions = {}
): {
  page: number;
  limit: number;
  skip: number;
  take: number;
  sortBy?: string;
  sortOrder: 'asc' | 'desc';
} {
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;
  const defaultSortOrder = options.defaultSortOrder ?? 'desc';

  const rawPage = Number(query['page']);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  const rawLimit = Number(query['limit']);
  let limit = Number.isInteger(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit;
  if (limit > maxLimit) {
    limit = maxLimit;
  }

  const rawSortOrder = typeof query['sortOrder'] === 'string' ? query['sortOrder'].toLowerCase() : '';
  const sortOrder: 'asc' | 'desc' = rawSortOrder === 'asc' ? 'asc' : defaultSortOrder;

  const sortBy = typeof query['sortBy'] === 'string' && query['sortBy'].trim().length > 0
    ? query['sortBy'].trim()
    : options.defaultSortBy;

  const skip = (page - 1) * limit;
  const take = limit;

  return {
    page,
    limit,
    skip,
    take,
    sortBy,
    sortOrder,
  };
}

/**
 * Constructs a standardized PaginatedResult wrapper given records, total item count, and pagination params.
 */
export function buildPaginatedResponse<T>(
  items: T[],
  totalItems: number,
  page: number,
  limit: number
): PaginatedResult<T> {
  const totalPages = Math.ceil(totalItems / limit) || 1;

  const pagination: PaginationMeta = {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };

  return {
    items,
    pagination,
  };
}
