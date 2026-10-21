import type { PaginatedResult } from '../../common/types/pagination.js';

export type StoreStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

export interface CreateStoreDto {
  name: string;
  code: string;
  description?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
  timezone?: string;
}

export interface UpdateStoreDto {
  name?: string;
  description?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
  timezone?: string;
}

export interface UpdateStoreStatusDto {
  status: StoreStatus;
}

export interface StoreQueryDto {
  page?: number;
  limit?: number;
  status?: StoreStatus;
  search?: string;
  sortBy?: 'name' | 'code' | 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface StoreResponseDto {
  id: string;
  name: string;
  code: string;
  description: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string | null;
  timezone: string;
  status: StoreStatus;
  createdAt: string;
  updatedAt: string;
}

export type PaginatedStoresResponse = PaginatedResult<StoreResponseDto>;
