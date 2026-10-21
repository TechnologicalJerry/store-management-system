import type { PaginatedResult } from '../../common/types/pagination.js';

export type CategoryStatus = 'ACTIVE' | 'INACTIVE';

export interface CreateCategoryDto {
  name: string;
  slug?: string;
  description?: string;
  parentId?: string;
}

export interface UpdateCategoryDto {
  name?: string;
  slug?: string;
  description?: string;
  parentId?: string | null;
}

export interface UpdateCategoryStatusDto {
  status: CategoryStatus;
}

export interface CategoryQueryDto {
  page?: number;
  limit?: number;
  parentId?: string;
  status?: CategoryStatus;
  search?: string;
  sortBy?: 'name' | 'slug' | 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface CategoryResponseDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  status: CategoryStatus;
  parent?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export type PaginatedCategoriesResponse = PaginatedResult<CategoryResponseDto>;
