import type { Prisma } from '@prisma/client';

export type SupplierStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
export type SupplierProductStatus = 'ACTIVE' | 'INACTIVE';

export interface CreateSupplierDto {
  name: string;
  code: string;
  email?: string;
  phone?: string;
  website?: string;
  taxIdentifier?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
  notes?: string;
}

export interface UpdateSupplierDto {
  name?: string;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  taxIdentifier?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
  notes?: string | null;
}

export interface UpdateSupplierStatusDto {
  status: SupplierStatus;
}

export interface SupplierQueryDto {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: SupplierStatus;
  sortBy?: 'name' | 'code' | 'status' | 'createdAt' | 'updatedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface CreateSupplierProductDto {
  variantId: string;
  supplierSku?: string;
  supplierProductName?: string;
  purchasePrice: number | string | Prisma.Decimal;
  currencyCode?: string;
  minimumOrderQuantity?: number | string | Prisma.Decimal;
  leadTimeDays?: number;
  isPreferred?: boolean;
}

export interface UpdateSupplierProductDto {
  supplierSku?: string | null;
  supplierProductName?: string | null;
  purchasePrice?: number | string | Prisma.Decimal;
  currencyCode?: string;
  minimumOrderQuantity?: number | string | Prisma.Decimal;
  leadTimeDays?: number | null;
  isPreferred?: boolean;
  status?: SupplierProductStatus;
}

export interface SupplierProductQueryDto {
  page?: number;
  pageSize?: number;
  status?: SupplierProductStatus;
  isPreferred?: boolean;
  search?: string;
}

export interface SupplierResponse {
  id: string;
  name: string;
  code: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  taxIdentifier: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string | null;
  status: SupplierStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  productsCount?: number;
}

export interface SupplierProductResponse {
  id: string;
  supplierId: string;
  variantId: string;
  supplierSku: string | null;
  supplierProductName: string | null;
  purchasePrice: string;
  currencyCode: string;
  minimumOrderQuantity: string;
  leadTimeDays: number | null;
  isPreferred: boolean;
  status: SupplierProductStatus;
  createdAt: string;
  updatedAt: string;
  variant?: {
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    status: string;
    product: {
      id: string;
      name: string;
      slug: string;
      status: string;
    };
  };
}
