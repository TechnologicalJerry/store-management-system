import type { PaginatedResult } from '../../common/types/pagination.js';

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
export type VariantStatus = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';

export interface CreateProductVariantDto {
  name: string;
  sku: string;
  barcode?: string;
  price: number | string;
  costPrice?: number | string;
  currency?: string;
  taxCategory?: string;
  attributes?: Record<string, unknown>;
  status?: VariantStatus;
}

export interface CreateProductDto {
  name: string;
  slug?: string;
  description?: string;
  categoryId: string;
  brand?: string;
  status?: ProductStatus;
  initialVariant?: CreateProductVariantDto;
}

export interface UpdateProductDto {
  name?: string;
  slug?: string;
  description?: string;
  categoryId?: string;
  brand?: string;
}

export interface UpdateProductStatusDto {
  status: ProductStatus;
}

export interface UpdateVariantDto {
  name?: string;
  sku?: string;
  barcode?: string | null;
  price?: number | string;
  costPrice?: number | string | null;
  currency?: string;
  taxCategory?: string;
  attributes?: Record<string, unknown>;
}

export interface UpdateVariantStatusDto {
  status: VariantStatus;
}

export interface ProductQueryDto {
  page?: number;
  limit?: number;
  categoryId?: string;
  status?: ProductStatus;
  brand?: string;
  search?: string;
  sortBy?: 'name' | 'slug' | 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface ProductVariantResponseDto {
  id: string;
  productId: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: string;
  costPrice: string | null;
  currency: string;
  taxCategory: string;
  attributes: Record<string, unknown> | null;
  status: VariantStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProductResponseDto {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  categoryId: string;
  brand: string | null;
  status: ProductStatus;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
  variants?: ProductVariantResponseDto[];
  createdAt: string;
  updatedAt: string;
}

export type PaginatedProductsResponse = PaginatedResult<ProductResponseDto>;
