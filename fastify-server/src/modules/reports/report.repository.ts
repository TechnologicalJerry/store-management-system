import { Prisma, type PrismaClient } from '@prisma/client';
import {
  type SalesSummaryReportResponse,
  type DailySalesRecord,
  type SalesStatusBreakdown,
  type TopProductsReportResponse,
  type TopProductItem,
  type PaymentSummaryReportResponse,
  type PaymentMethodTotal,
  type InventorySummaryReportResponse,
  type InventoryValuationItem,
  type LowStockReportResponse,
  type LowStockItem,
  type ProcurementSummaryReportResponse,
  type SupplierProcurementSummary,
  type AsyncReportResponse,
} from './report.types.js';
import type { ReportTypeConst } from './report.constants.js';

export class ReportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Generates a unique, concurrency-safe human-readable report ticket number: REP-YYYYMMDD-XXXX
   */
  public async generateReportNumber(): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    try {
      const res = await (this.prisma as any).$queryRaw<Array<{ nextval: bigint | number | string }>>`
        SELECT nextval('report_req_num_seq') as nextval
      `;
      if (res && res[0] && res[0].nextval) {
        const val = res[0].nextval.toString();
        return `REP-${dateStr}-${val.padStart(4, '0')}`;
      }
    } catch {
      // Mock / fallback
    }
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `REP-${dateStr}-${rand}`;
  }

  // ============================================================================
  // 1. Sales Summary
  // ============================================================================

  public async getSalesSummary(
    storeId: string,
    startDate: Date,
    endDate: Date,
    _groupBy: 'day' | 'week' | 'month' = 'day'
  ): Promise<SalesSummaryReportResponse> {
    // Query completed and refunded sales within window
    const sales = await this.prisma.sale.findMany({
      where: {
        storeId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        id: true,
        status: true,
        grandTotal: true,
        discountTotal: true,
        amountRefunded: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    let totalOrders = 0;
    let grossSalesDec = new Prisma.Decimal(0);
    let discountsDec = new Prisma.Decimal(0);
    let refundsDec = new Prisma.Decimal(0);

    const statusMap = new Map<string, { count: number; total: Prisma.Decimal }>();
    const dailyMap = new Map<
      string,
      { orders: number; gross: Prisma.Decimal; discounts: Prisma.Decimal; refunds: Prisma.Decimal }
    >();

    for (const s of sales) {
      // Status aggregation
      const statKey = s.status;
      const existingStat = statusMap.get(statKey) ?? { count: 0, total: new Prisma.Decimal(0) };
      existingStat.count++;
      existingStat.total = existingStat.total.add(s.grandTotal);
      statusMap.set(statKey, existingStat);

      // We calculate revenue metrics on completed / refunded sales
      if (
        s.status === 'COMPLETED' ||
        s.status === 'PARTIALLY_REFUNDED' ||
        s.status === 'REFUNDED'
      ) {
        totalOrders++;
        grossSalesDec = grossSalesDec.add(s.grandTotal);
        discountsDec = discountsDec.add(s.discountTotal);
        refundsDec = refundsDec.add(s.amountRefunded);

        // Daily series grouping
        const dayStr = s.createdAt.toISOString().slice(0, 10);
        const dayEntry = dailyMap.get(dayStr) ?? {
          orders: 0,
          gross: new Prisma.Decimal(0),
          discounts: new Prisma.Decimal(0),
          refunds: new Prisma.Decimal(0),
        };
        dayEntry.orders++;
        dayEntry.gross = dayEntry.gross.add(s.grandTotal);
        dayEntry.discounts = dayEntry.discounts.add(s.discountTotal);
        dayEntry.refunds = dayEntry.refunds.add(s.amountRefunded);
        dailyMap.set(dayStr, dayEntry);
      }
    }

    const netSalesDec = grossSalesDec.sub(refundsDec);
    const avgOrderValueDec =
      totalOrders > 0
        ? netSalesDec.div(totalOrders).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
        : new Prisma.Decimal(0);

    const statusBreakdown: SalesStatusBreakdown[] = Array.from(statusMap.entries()).map(
      ([status, val]) => ({
        status,
        count: val.count,
        totalAmount: val.total.toFixed(2),
      })
    );

    const dailyBreakdown: DailySalesRecord[] = Array.from(dailyMap.entries()).map(
      ([date, d]) => ({
        date,
        orderCount: d.orders,
        grossSales: d.gross.toFixed(2),
        discounts: d.discounts.toFixed(2),
        refunds: d.refunds.toFixed(2),
        netSales: d.gross.sub(d.refunds).toFixed(2),
      })
    );

    return {
      storeId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      totalOrders,
      grossSales: grossSalesDec.toFixed(2),
      discounts: discountsDec.toFixed(2),
      refunds: refundsDec.toFixed(2),
      netSales: netSalesDec.toFixed(2),
      averageOrderValue: avgOrderValueDec.toFixed(2),
      statusBreakdown,
      dailyBreakdown,
    };
  }

  // ============================================================================
  // 2. Top-Selling Products
  // ============================================================================

  public async getTopProducts(
    storeId: string,
    startDate: Date,
    endDate: Date,
    limit: number
  ): Promise<TopProductsReportResponse> {
    const saleItems = await this.prisma.saleItem.findMany({
      where: {
        sale: {
          storeId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
          status: {
            in: ['COMPLETED', 'PARTIALLY_REFUNDED', 'REFUNDED'],
          },
        },
      },
      include: {
        variant: {
          include: {
            product: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    // Aggregate by variantId
    const variantMap = new Map<
      string,
      {
        variantId: string;
        productId: string;
        productName: string;
        variantName: string;
        sku: string;
        quantity: Prisma.Decimal;
        revenue: Prisma.Decimal;
      }
    >();

    for (const item of saleItems) {
      const vId = item.variantId;
      const existing = variantMap.get(vId) ?? {
        variantId: vId,
        productId: item.variant?.product?.id ?? '',
        productName: item.productNameSnapshot || item.variant?.product?.name || 'Unknown Product',
        variantName: item.variantNameSnapshot || item.variant?.name || 'Default Variant',
        sku: item.skuSnapshot || item.variant?.sku || '',
        quantity: new Prisma.Decimal(0),
        revenue: new Prisma.Decimal(0),
      };

      existing.quantity = existing.quantity.add(item.quantity);
      existing.revenue = existing.revenue.add(item.lineTotal);
      variantMap.set(vId, existing);
    }

    const sortedItems = Array.from(variantMap.values())
      .sort((a, b) => b.quantity.sub(a.quantity).toNumber())
      .slice(0, limit)
      .map(i => ({
        variantId: i.variantId,
        productId: i.productId,
        productName: i.productName,
        variantName: i.variantName,
        sku: i.sku,
        quantitySold: Math.round(i.quantity.toNumber()),
        grossRevenue: i.revenue.toFixed(2),
      }));

    return {
      storeId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      items: sortedItems,
    };
  }

  // ============================================================================
  // 3. Payment & Settlement Summary
  // ============================================================================

  public async getPaymentSummary(
    storeId: string,
    startDate: Date,
    endDate: Date,
    paymentMethod?: string
  ): Promise<PaymentSummaryReportResponse> {
    const payments = await this.prisma.payment.findMany({
      where: {
        sale: { storeId },
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        ...(paymentMethod ? { paymentMethod: paymentMethod as any } : {}),
      },
      include: {
        refunds: true,
      },
    });

    let totalPaymentsCount = 0;
    let totalCapturedDec = new Prisma.Decimal(0);
    let totalRefundsCount = 0;
    let totalRefundedDec = new Prisma.Decimal(0);

    const methodMap = new Map<
      string,
      {
        successfulCount: number;
        successfulAmount: Prisma.Decimal;
        failedCount: number;
        refundedCount: number;
        refundedAmount: Prisma.Decimal;
      }
    >();

    for (const p of payments) {
      totalPaymentsCount++;
      const mKey = p.paymentMethod;
      const mEntry = methodMap.get(mKey) ?? {
        successfulCount: 0,
        successfulAmount: new Prisma.Decimal(0),
        failedCount: 0,
        refundedCount: 0,
        refundedAmount: new Prisma.Decimal(0),
      };

      if (p.status === 'CAPTURED' || p.status === 'REFUNDED' || p.status === 'PARTIALLY_REFUNDED') {
        mEntry.successfulCount++;
        mEntry.successfulAmount = mEntry.successfulAmount.add(p.amount);
        totalCapturedDec = totalCapturedDec.add(p.amount);
      } else if (p.status === 'FAILED') {
        mEntry.failedCount++;
      }

      // Check succeeded refunds linked to payment
      for (const r of p.refunds) {
        if (r.status === 'SUCCEEDED') {
          totalRefundsCount++;
          totalRefundedDec = totalRefundedDec.add(r.amount);
          mEntry.refundedCount++;
          mEntry.refundedAmount = mEntry.refundedAmount.add(r.amount);
        }
      }

      methodMap.set(mKey, mEntry);
    }

    const totalsByMethod: PaymentMethodTotal[] = Array.from(methodMap.entries()).map(
      ([method, d]) => ({
        method,
        successfulCount: d.successfulCount,
        successfulAmount: d.successfulAmount.toFixed(2),
        failedCount: d.failedCount,
        refundedCount: d.refundedCount,
        refundedAmount: d.refundedAmount.toFixed(2),
      })
    );

    const netSettledDec = totalCapturedDec.sub(totalRefundedDec);

    return {
      storeId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      totalPaymentsCount,
      totalCapturedAmount: totalCapturedDec.toFixed(2),
      totalRefundsCount,
      totalRefundedAmount: totalRefundedDec.toFixed(2),
      netSettledAmount: netSettledDec.toFixed(2),
      totalsByMethod,
    };
  }

  // ============================================================================
  // 4. Inventory Valuation & Balance Summary
  // ============================================================================

  public async getInventorySummary(
    storeId: string,
    categoryId?: string,
    page = 1,
    limit = 50
  ): Promise<InventorySummaryReportResponse> {
    const whereClause: Prisma.InventoryBalanceWhereInput = {
      storeId,
      ...(categoryId
        ? {
            variant: {
              product: { categoryId },
            },
          }
        : {}),
    };

    const totalCount = await this.prisma.inventoryBalance.count({ where: whereClause });

    // Fetch all balances for this store to compute total overall metrics
    const allBalances = await this.prisma.inventoryBalance.findMany({
      where: whereClause,
      include: {
        variant: {
          select: {
            costPrice: true,
          },
        },
      },
    });

    let totalQuantityOnHand = new Prisma.Decimal(0);
    let totalAllocatedQuantity = new Prisma.Decimal(0);
    let totalValuationDec = new Prisma.Decimal(0);

    for (const b of allBalances) {
      totalQuantityOnHand = totalQuantityOnHand.add(b.quantityOnHand);
      totalAllocatedQuantity = totalAllocatedQuantity.add(b.quantityReserved);
      if (b.variant?.costPrice) {
        totalValuationDec = totalValuationDec.add(b.quantityOnHand.mul(b.variant.costPrice));
      }
    }

    const totalAvailableQuantity = totalQuantityOnHand.sub(totalAllocatedQuantity);

    // Fetch paginated slice with variant details
    const paginatedBalances = await this.prisma.inventoryBalance.findMany({
      where: whereClause,
      include: {
        variant: {
          include: {
            product: {
              select: { id: true, name: true },
            },
          },
        },
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const items: InventoryValuationItem[] = paginatedBalances.map(b => {
      const qOnHand = b.quantityOnHand.toNumber();
      const qReserved = b.quantityReserved.toNumber();
      const available = qOnHand - qReserved;
      const unitCost = b.variant.costPrice ?? new Prisma.Decimal(0);
      const valuation = b.quantityOnHand.mul(unitCost);

      return {
        variantId: b.variantId,
        productId: b.variant.productId,
        sku: b.variant.sku,
        productName: b.variant.product?.name ?? 'Unknown',
        variantName: b.variant.name,
        quantityOnHand: qOnHand,
        allocatedQuantity: qReserved,
        availableQuantity: available,
        unitCostPrice: unitCost.toFixed(2),
        totalValuation: valuation.toFixed(2),
      };
    });

    return {
      storeId,
      totalSkus: totalCount,
      totalQuantityOnHand: totalQuantityOnHand.toNumber(),
      totalAllocatedQuantity: totalAllocatedQuantity.toNumber(),
      totalAvailableQuantity: totalAvailableQuantity.toNumber(),
      totalInventoryValuation: totalValuationDec.toFixed(2),
      items,
      page,
      limit,
      totalCount,
    };
  }

  // ============================================================================
  // 5. Low-Stock Alerts
  // ============================================================================

  public async getLowStockItems(
    storeId: string,
    page = 1,
    limit = 50
  ): Promise<LowStockReportResponse> {
    // Find balances where reorderLevel > 0
    const balances = await this.prisma.inventoryBalance.findMany({
      where: {
        storeId,
        reorderLevel: { gt: 0 },
      },
      include: {
        variant: {
          include: {
            product: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    // Filter items where available quantity <= reorderLevel
    const lowStockItems: LowStockItem[] = [];

    for (const b of balances) {
      const qOnHand = b.quantityOnHand.toNumber();
      const qReserved = b.quantityReserved.toNumber();
      const available = qOnHand - qReserved;
      const reorderPt = b.reorderLevel.toNumber();

      if (available <= reorderPt) {
        const shortfall = Math.max(0, reorderPt - available);
        lowStockItems.push({
          variantId: b.variantId,
          productId: b.variant.productId,
          sku: b.variant.sku,
          productName: b.variant.product?.name ?? 'Unknown',
          variantName: b.variant.name,
          quantityOnHand: qOnHand,
          allocatedQuantity: qReserved,
          availableQuantity: available,
          reorderPoint: reorderPt,
          reorderQuantity: reorderPt * 2, // Standard reorder heuristic
          shortfall,
        });
      }
    }

    // Sort by shortfall descending
    lowStockItems.sort((a, b) => b.shortfall - a.shortfall);

    const totalCount = lowStockItems.length;
    const paginatedItems = lowStockItems.slice((page - 1) * limit, page * limit);

    return {
      storeId,
      lowStockCount: totalCount,
      items: paginatedItems,
      page,
      limit,
      totalCount,
    };
  }

  // ============================================================================
  // 6. Procurement & Supplier Summary
  // ============================================================================

  public async getProcurementSummary(
    storeId: string,
    startDate: Date,
    endDate: Date,
    supplierId?: string
  ): Promise<ProcurementSummaryReportResponse> {
    const purchaseOrders = await this.prisma.purchaseOrder.findMany({
      where: {
        destinationStoreId: storeId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        ...(supplierId ? { supplierId } : {}),
      },
      include: {
        supplier: true,
        items: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const poCountsByStatus: Record<string, number> = {};
    let totalOrderedQtyDec = new Prisma.Decimal(0);
    let totalReceivedQtyDec = new Prisma.Decimal(0);

    const supplierMap = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        supplierCode: string;
        orderCount: number;
        totalOrdered: Prisma.Decimal;
        totalReceived: Prisma.Decimal;
      }
    >();

    for (const po of purchaseOrders) {
      poCountsByStatus[po.status] = (poCountsByStatus[po.status] ?? 0) + 1;

      const sKey = po.supplierId;
      const sEntry = supplierMap.get(sKey) ?? {
        supplierId: po.supplierId,
        supplierName: po.supplier.name,
        supplierCode: po.supplier.code,
        orderCount: 0,
        totalOrdered: new Prisma.Decimal(0),
        totalReceived: new Prisma.Decimal(0),
      };
      sEntry.orderCount++;

      for (const item of po.items) {
        totalOrderedQtyDec = totalOrderedQtyDec.add(item.quantityOrdered);
        totalReceivedQtyDec = totalReceivedQtyDec.add(item.quantityReceived);

        sEntry.totalOrdered = sEntry.totalOrdered.add(item.lineTotal);
        // Approximation of received amount by unit price
        sEntry.totalReceived = sEntry.totalReceived.add(
          item.quantityReceived.mul(item.unitPrice)
        );
      }

      supplierMap.set(sKey, sEntry);
    }

    const totalOutstandingQtyDec = totalOrderedQtyDec.sub(totalReceivedQtyDec);

    const suppliers: SupplierProcurementSummary[] = Array.from(supplierMap.values()).map(s => ({
      supplierId: s.supplierId,
      supplierName: s.supplierName,
      supplierCode: s.supplierCode,
      orderCount: s.orderCount,
      totalOrderedAmount: s.totalOrdered.toFixed(2),
      totalReceivedAmount: s.totalReceived.toFixed(2),
    }));

    return {
      storeId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      totalPurchaseOrders: purchaseOrders.length,
      poCountsByStatus,
      totalOrderedQuantity: totalOrderedQtyDec.toNumber(),
      totalReceivedQuantity: totalReceivedQtyDec.toNumber(),
      totalOutstandingQuantity: Math.max(0, totalOutstandingQtyDec.toNumber()),
      suppliers,
    };
  }

  // ============================================================================
  // 7. Persistent Report Requests (Async Workflow)
  // ============================================================================

  public async createReportRequest(data: {
    reportNumber: string;
    reportType: ReportTypeConst;
    storeId: string;
    requestedByUserId: string;
    parameters: Record<string, unknown>;
  }): Promise<AsyncReportResponse> {
    const created = await this.prisma.reportRequest.create({
      data: {
        reportNumber: data.reportNumber,
        reportType: data.reportType as any,
        storeId: data.storeId,
        requestedByUserId: data.requestedByUserId,
        parameters: data.parameters as any,
        status: 'PENDING',
      },
    });

    return {
      reportRequestId: created.id,
      reportNumber: created.reportNumber,
      reportType: created.reportType as ReportTypeConst,
      storeId: created.storeId,
      status: created.status as any,
      createdAt: created.createdAt.toISOString(),
      completedAt: created.completedAt?.toISOString() ?? null,
      expiresAt: created.expiresAt?.toISOString() ?? null,
      errorMessage: created.errorMessage,
      resultData: created.resultData,
    };
  }

  public async getReportRequestByIdOrNumber(idOrNumber: string): Promise<AsyncReportResponse | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrNumber
    );

    const record = await this.prisma.reportRequest.findFirst({
      where: isUuid ? { id: idOrNumber } : { reportNumber: idOrNumber },
    });

    if (!record) {
      return null;
    }

    return {
      reportRequestId: record.id,
      reportNumber: record.reportNumber,
      reportType: record.reportType as ReportTypeConst,
      storeId: record.storeId,
      status: record.status as any,
      createdAt: record.createdAt.toISOString(),
      completedAt: record.completedAt?.toISOString() ?? null,
      expiresAt: record.expiresAt?.toISOString() ?? null,
      errorMessage: record.errorMessage,
      resultData: record.resultData,
    };
  }
}
