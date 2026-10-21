/**
 * Common pagination query parameters.
 */
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Standard paginated response metadata.
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Generic paginated result wrapper.
 */
export interface PaginatedResult<T> {
  items: T[];
  pagination: PaginationMeta;
}
