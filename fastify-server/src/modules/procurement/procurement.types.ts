import type { Prisma } from '@prisma/client';

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'ORDERED'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED';

export type GoodsReceiptStatus = 'COMPLETED' | 'CANCELLED';

export interface CreatePurchaseOrderItemDto {
  variantId: string;
  supplierProductId?: string;
  quantityOrdered: number | string | Prisma.Decimal;
  unitPrice?: number | string | Prisma.Decimal;
  discountAmount?: number | string | Prisma.Decimal;
  taxRate?: number | string | Prisma.Decimal;
}

export interface CreatePurchaseOrderDto {
  supplierId: string;
  destinationStoreId: string;
  currencyCode?: string;
  shippingTotal?: number | string | Prisma.Decimal;
  expectedDeliveryAt?: string;
  notes?: string;
  items: CreatePurchaseOrderItemDto[];
}

export interface UpdatePurchaseOrderDto {
  shippingTotal?: number | string | Prisma.Decimal;
  expectedDeliveryAt?: string | null;
  notes?: string | null;
  items?: CreatePurchaseOrderItemDto[];
}

export interface PurchaseOrderQueryDto {
  page?: number;
  pageSize?: number;
  supplierId?: string;
  destinationStoreId?: string;
  status?: PurchaseOrderStatus;
  search?: string;
  fromOrderedAt?: string;
  toOrderedAt?: string;
  sortBy?: 'createdAt' | 'orderedAt' | 'expectedDeliveryAt' | 'grandTotal' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface ApprovePurchaseOrderDto {
  notes?: string;
}

export interface CancelPurchaseOrderDto {
  reason: string;
}

export interface CreateGoodsReceiptItemDto {
  purchaseOrderItemId: string;
  quantityDelivered: number | string | Prisma.Decimal;
  quantityAccepted: number | string | Prisma.Decimal;
  quantityRejected?: number | string | Prisma.Decimal;
  rejectionReason?: string;
}

export interface CreateGoodsReceiptDto {
  deliveryReference?: string;
  notes?: string;
  idempotencyKey?: string;
  items: CreateGoodsReceiptItemDto[];
}

export interface GoodsReceiptQueryDto {
  page?: number;
  pageSize?: number;
  purchaseOrderId?: string;
  destinationStoreId?: string;
}

// ==============================================================================
// Serialized Response Models
// ==============================================================================

export interface PurchaseOrderItemResponse {
  id: string;
  purchaseOrderId: string;
  variantId: string;
  supplierProductId: string | null;
  skuSnapshot: string;
  productNameSnapshot: string;
  supplierSkuSnapshot: string | null;
  quantityOrdered: string;
  quantityReceived: string;
  quantityOutstanding: string;
  unitPrice: string;
  discountAmount: string;
  taxRate: string;
  lineTotal: string;
  createdAt: string;
  updatedAt: string;
  variant?: {
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
    status: string;
  };
}

export interface PurchaseOrderStatusHistoryResponse {
  id: string;
  purchaseOrderId: string;
  fromStatus: PurchaseOrderStatus;
  toStatus: PurchaseOrderStatus;
  changedByUserId: string | null;
  changedByUser?: {
    id: string;
    name: string;
    email: string;
  } | null;
  reason: string | null;
  createdAt: string;
}

export interface PurchaseOrderResponse {
  id: string;
  purchaseOrderNumber: string;
  supplierId: string;
  destinationStoreId: string;
  status: PurchaseOrderStatus;
  currencyCode: string;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  shippingTotal: string;
  grandTotal: string;
  notes: string | null;
  createdByUserId: string | null;
  createdByUser?: {
    id: string;
    name: string;
    email: string;
  } | null;
  approvedByUserId: string | null;
  approvedByUser?: {
    id: string;
    name: string;
    email: string;
  } | null;
  approvedAt: string | null;
  orderedAt: string | null;
  expectedDeliveryAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  supplier?: {
    id: string;
    name: string;
    code: string;
    status: string;
    email: string | null;
  };
  destinationStore?: {
    id: string;
    name: string;
    code: string;
    status: string;
  };
  items?: PurchaseOrderItemResponse[];
  statusHistory?: PurchaseOrderStatusHistoryResponse[];
  goodsReceiptsCount?: number;
}

export interface GoodsReceiptItemResponse {
  id: string;
  goodsReceiptId: string;
  purchaseOrderItemId: string;
  variantId: string;
  quantityDelivered: string;
  quantityAccepted: string;
  quantityRejected: string;
  rejectionReason: string | null;
  createdAt: string;
  variant?: {
    id: string;
    name: string;
    sku: string;
    barcode: string | null;
  };
}

export interface GoodsReceiptResponse {
  id: string;
  receiptNumber: string;
  purchaseOrderId: string;
  destinationStoreId: string;
  status: GoodsReceiptStatus;
  receivedByUserId: string | null;
  receivedByUser?: {
    id: string;
    name: string;
    email: string;
  } | null;
  receivedAt: string;
  deliveryReference: string | null;
  notes: string | null;
  idempotencyKey: string | null;
  createdAt: string;
  updatedAt: string;
  items?: GoodsReceiptItemResponse[];
  purchaseOrder?: {
    id: string;
    purchaseOrderNumber: string;
    status: PurchaseOrderStatus;
  };
}
