import { Prisma } from '@prisma/client';
import type { SaleStatusType } from './sale.constants.js';

export interface CreateSaleItemInput {
  variantId: string;
  quantity: string | number;
  discountAmount?: string | number;
}

export interface CreateSaleDto {
  storeId: string;
  currencyCode?: string;
  notes?: string;
  idempotencyKey?: string;
  items: CreateSaleItemInput[];
}

export interface DirectCheckoutDto {
  storeId: string;
  currencyCode?: string;
  notes?: string;
  idempotencyKey?: string;
  items: CreateSaleItemInput[];
  paymentMethod: 'CASH' | 'CARD' | 'EXTERNAL_DIGITAL' | 'STORE_CREDIT';
  amountTendered?: string | number;
  provider?: string;
  providerTransactionId?: string;
}

export interface CompleteCheckoutDto {
  paymentMethod: 'CASH' | 'CARD' | 'EXTERNAL_DIGITAL' | 'STORE_CREDIT';
  amountTendered?: string | number;
  provider?: string;
  providerTransactionId?: string;
  idempotencyKey?: string;
}

export interface CancelSaleDto {
  reason: string;
}

export interface SaleQueryDto {
  storeId?: string;
  status?: SaleStatusType;
  cashierUserId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface SaleItemResponseDto {
  id: string;
  saleId: string;
  variantId: string;
  skuSnapshot: string;
  productNameSnapshot: string;
  variantNameSnapshot: string | null;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  taxRate: string;
  taxAmount: string;
  lineTotal: string;
  createdAt: string;
}

export interface SalePaymentSummaryDto {
  id: string;
  paymentReference: string;
  paymentMethod: string;
  status: string;
  amount: string;
  currencyCode: string;
  provider: string;
  capturedAt: string | null;
}

export interface SaleRefundSummaryDto {
  id: string;
  refundReference: string;
  amount: string;
  currencyCode: string;
  status: string;
  reason: string;
  processedAt: string | null;
}

export interface SaleReceiptSummaryDto {
  id: string;
  receiptNumber: string;
  issuedAt: string;
}

export interface SaleResponseDto {
  id: string;
  saleNumber: string;
  storeId: string;
  status: SaleStatusType;
  currencyCode: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  grandTotal: string;
  amountPaid: string;
  amountRefunded: string;
  changeDue?: string;
  cashierUserId: string | null;
  idempotencyKey: string | null;
  notes: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: SaleItemResponseDto[];
  payments?: SalePaymentSummaryDto[];
  refunds?: SaleRefundSummaryDto[];
  receipt?: SaleReceiptSummaryDto | null;
}

export interface ReceiptDataSnapshot {
  saleNumber: string;
  receiptNumber: string;
  issuedAt: string;
  store: {
    id: string;
    name: string;
    code: string;
    addressLine1?: string | null;
    city?: string | null;
    state?: string | null;
    phone?: string | null;
  };
  cashier: {
    id?: string | null;
    name: string;
  };
  items: Array<{
    sku: string;
    name: string;
    variantName?: string | null;
    quantity: string;
    unitPrice: string;
    discountAmount: string;
    taxAmount: string;
    lineTotal: string;
  }>;
  financialSummary: {
    subtotal: string;
    discountTotal: string;
    taxTotal: string;
    grandTotal: string;
    amountPaid: string;
    amountRefunded: string;
    currencyCode: string;
  };
  payments: Array<{
    reference: string;
    method: string;
    amount: string;
    status: string;
    provider: string;
  }>;
}

export interface ReceiptResponseDto {
  id: string;
  receiptNumber: string;
  saleId: string;
  storeId: string;
  storeNameSnapshot: string;
  storeAddressSnapshot: string | null;
  cashierNameSnapshot: string;
  receiptData: ReceiptDataSnapshot;
  issuedAt: string;
  createdAt: string;
}
