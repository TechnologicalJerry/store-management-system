import type { ReportTypeConst } from './report.constants.js';

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

export interface DailySalesRecord {
  date: string;
  orderCount: number;
  grossSales: string;
  discounts: string;
  refunds: string;
  netSales: string;
}

export interface SalesStatusBreakdown {
  status: string;
  count: number;
  totalAmount: string;
}

export interface SalesSummaryReportResponse {
  storeId: string;
  startDate: string;
  endDate: string;
  totalOrders: number;
  grossSales: string;
  discounts: string;
  refunds: string;
  netSales: string;
  averageOrderValue: string;
  statusBreakdown: SalesStatusBreakdown[];
  dailyBreakdown: DailySalesRecord[];
}

export interface TopProductItem {
  productId: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantitySold: number;
  grossRevenue: string;
}

export interface TopProductsReportResponse {
  storeId: string;
  startDate: string;
  endDate: string;
  items: TopProductItem[];
}

export interface PaymentMethodTotal {
  method: string;
  successfulCount: number;
  successfulAmount: string;
  failedCount: number;
  refundedCount: number;
  refundedAmount: string;
}

export interface PaymentSummaryReportResponse {
  storeId: string;
  startDate: string;
  endDate: string;
  totalPaymentsCount: number;
  totalCapturedAmount: string;
  totalRefundsCount: number;
  totalRefundedAmount: string;
  netSettledAmount: string;
  totalsByMethod: PaymentMethodTotal[];
}

export interface InventoryValuationItem {
  variantId: string;
  productId: string;
  sku: string;
  productName: string;
  variantName: string;
  quantityOnHand: number;
  allocatedQuantity: number;
  availableQuantity: number;
  unitCostPrice: string;
  totalValuation: string;
}

export interface InventorySummaryReportResponse {
  storeId: string;
  totalSkus: number;
  totalQuantityOnHand: number;
  totalAllocatedQuantity: number;
  totalAvailableQuantity: number;
  totalInventoryValuation: string;
  items: InventoryValuationItem[];
  page: number;
  limit: number;
  totalCount: number;
}

export interface LowStockItem {
  variantId: string;
  productId: string;
  sku: string;
  productName: string;
  variantName: string;
  quantityOnHand: number;
  allocatedQuantity: number;
  availableQuantity: number;
  reorderPoint: number;
  reorderQuantity: number;
  shortfall: number;
}

export interface LowStockReportResponse {
  storeId: string;
  lowStockCount: number;
  items: LowStockItem[];
  page: number;
  limit: number;
  totalCount: number;
}

export interface SupplierProcurementSummary {
  supplierId: string;
  supplierName: string;
  supplierCode: string;
  orderCount: number;
  totalOrderedAmount: string;
  totalReceivedAmount: string;
}

export interface ProcurementSummaryReportResponse {
  storeId: string;
  startDate: string;
  endDate: string;
  totalPurchaseOrders: number;
  poCountsByStatus: Record<string, number>;
  totalOrderedQuantity: number;
  totalReceivedQuantity: number;
  totalOutstandingQuantity: number;
  suppliers: SupplierProcurementSummary[];
}

export interface AsyncReportRequestDTO {
  storeId: string;
  reportType: ReportTypeConst;
  parameters: Record<string, unknown>;
}

export interface AsyncReportResponse {
  reportRequestId: string;
  reportNumber: string;
  reportType: ReportTypeConst;
  storeId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  completedAt?: string | null;
  expiresAt?: string | null;
  errorMessage?: string | null;
  resultData?: unknown;
}
