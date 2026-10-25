import type { PrismaClient } from '@prisma/client';
import { logger } from '../../common/utils/logger.js';
import { ReportRepository } from './report.repository.js';
import {
  type SalesSummaryQuery,
  type TopProductsQuery,
  type PaymentSummaryQuery,
  type InventorySummaryQuery,
  type LowStockQuery,
  type ProcurementSummaryQuery,
  type AsyncReportRequestInput,
} from './report.schemas.js';
import {
  type SalesSummaryReportResponse,
  type TopProductsReportResponse,
  type PaymentSummaryReportResponse,
  type InventorySummaryReportResponse,
  type LowStockReportResponse,
  type ProcurementSummaryReportResponse,
  type AsyncReportResponse,
  type DateRange,
} from './report.types.js';
import {
  InvalidDateRangeError,
  ReportDateRangeExceededError,
  ReportNotFoundError,
  ReportAccessDeniedError,
} from './report.errors.js';
import { REPORT_LIMITS } from './report.constants.js';
import { getCacheService, CacheService } from '../../infrastructure/redis/cache.service.js';
import { getQueueManager, QUEUE_NAMES } from '../../infrastructure/queues/queue.service.js';
import type { ReportGenerationPayload } from '../../jobs/report-generation.job.js';

export class ReportService {
  private repository: ReportRepository;
  private cache: CacheService;

  constructor(
    private readonly prisma: PrismaClient,
    cacheService?: CacheService
  ) {
    this.repository = new ReportRepository(prisma);
    this.cache = cacheService ?? getCacheService();
  }

  // ============================================================================
  // Date Range Helper & Guard
  // ============================================================================

  private resolveAndValidateDateRange(
    rawStart?: string,
    rawEnd?: string,
    maxDays = REPORT_LIMITS.MAX_SYNC_DATE_RANGE_DAYS
  ): DateRange {
    const now = new Date();
    const endDate = rawEnd ? new Date(rawEnd) : now;
    const startDate = rawStart
      ? new Date(rawStart)
      : new Date(endDate.getTime() - REPORT_LIMITS.DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new InvalidDateRangeError('Malformed ISO 8601 date string provided.');
    }

    if (startDate > endDate) {
      throw new InvalidDateRangeError();
    }

    const durationDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
    if (durationDays > maxDays) {
      throw new ReportDateRangeExceededError(maxDays);
    }

    return { startDate, endDate };
  }

  // ============================================================================
  // 1. Sales Summary
  // ============================================================================

  public async getSalesSummary(query: SalesSummaryQuery): Promise<SalesSummaryReportResponse> {
    const { startDate, endDate } = this.resolveAndValidateDateRange(query.startDate, query.endDate);
    const groupBy = query.groupBy ?? 'day';

    const cacheKey = this.cache.buildKey(
      'reports:sales',
      `${query.storeId}:${startDate.toISOString().slice(0, 10)}:${endDate.toISOString().slice(0, 10)}:${groupBy}`
    );

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        logger.info(
          { storeId: query.storeId, startDate, endDate, groupBy },
          'Compiling database sales summary report'
        );
        return this.repository.getSalesSummary(query.storeId, startDate, endDate, groupBy);
      },
      { ttlSeconds: 300 }
    );
  }

  // ============================================================================
  // 2. Top Products
  // ============================================================================

  public async getTopProducts(query: TopProductsQuery): Promise<TopProductsReportResponse> {
    const { startDate, endDate } = this.resolveAndValidateDateRange(query.startDate, query.endDate);
    const limit = query.limit ?? REPORT_LIMITS.DEFAULT_TOP_PRODUCTS_LIMIT;

    const cacheKey = this.cache.buildKey(
      'reports:top-products',
      `${query.storeId}:${startDate.toISOString().slice(0, 10)}:${endDate.toISOString().slice(0, 10)}:${limit}`
    );

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        logger.info(
          { storeId: query.storeId, startDate, endDate, limit },
          'Compiling top-selling products report'
        );
        return this.repository.getTopProducts(query.storeId, startDate, endDate, limit);
      },
      { ttlSeconds: 300 }
    );
  }

  // ============================================================================
  // 3. Payment & Settlement Summary
  // ============================================================================

  public async getPaymentSummary(query: PaymentSummaryQuery): Promise<PaymentSummaryReportResponse> {
    const { startDate, endDate } = this.resolveAndValidateDateRange(query.startDate, query.endDate);

    const cacheKey = this.cache.buildKey(
      'reports:payments',
      `${query.storeId}:${startDate.toISOString().slice(0, 10)}:${endDate.toISOString().slice(0, 10)}:${query.paymentMethod ?? 'ALL'}`
    );

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        logger.info(
          { storeId: query.storeId, startDate, endDate, method: query.paymentMethod },
          'Compiling payment reconciliation report'
        );
        return this.repository.getPaymentSummary(
          query.storeId,
          startDate,
          endDate,
          query.paymentMethod
        );
      },
      { ttlSeconds: 300 }
    );
  }

  // ============================================================================
  // 4. Inventory Valuation & Balances
  // ============================================================================

  public async getInventorySummary(
    query: InventorySummaryQuery
  ): Promise<InventorySummaryReportResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? REPORT_LIMITS.DEFAULT_PAGE_SIZE;

    const cacheKey = this.cache.buildKey(
      'reports:inventory',
      `${query.storeId}:${query.categoryId ?? 'ALL'}:${page}:${limit}`
    );

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        logger.info(
          { storeId: query.storeId, categoryId: query.categoryId, page, limit },
          'Compiling inventory valuation report'
        );
        return this.repository.getInventorySummary(query.storeId, query.categoryId, page, limit);
      },
      { ttlSeconds: 180 }
    );
  }

  // ============================================================================
  // 5. Low-Stock Alerts
  // ============================================================================

  public async getLowStockItems(query: LowStockQuery): Promise<LowStockReportResponse> {
    const page = query.page ?? 1;
    const limit = query.limit ?? REPORT_LIMITS.DEFAULT_PAGE_SIZE;

    // Direct database calculation; low-stock requires real-time operational accuracy
    logger.info({ storeId: query.storeId, page, limit }, 'Querying low-stock items');
    return this.repository.getLowStockItems(query.storeId, page, limit);
  }

  // ============================================================================
  // 6. Procurement & Supplier Summary
  // ============================================================================

  public async getProcurementSummary(
    query: ProcurementSummaryQuery
  ): Promise<ProcurementSummaryReportResponse> {
    const { startDate, endDate } = this.resolveAndValidateDateRange(query.startDate, query.endDate);

    const cacheKey = this.cache.buildKey(
      'reports:procurement',
      `${query.storeId}:${startDate.toISOString().slice(0, 10)}:${endDate.toISOString().slice(0, 10)}:${query.supplierId ?? 'ALL'}`
    );

    return this.cache.getOrSet(
      cacheKey,
      async () => {
        logger.info(
          { storeId: query.storeId, startDate, endDate, supplierId: query.supplierId },
          'Compiling procurement summary report'
        );
        return this.repository.getProcurementSummary(
          query.storeId,
          startDate,
          endDate,
          query.supplierId
        );
      },
      { ttlSeconds: 300 }
    );
  }

  // ============================================================================
  // 7. Asynchronous Report Generation Workflow
  // ============================================================================

  public async requestAsyncReport(
    input: AsyncReportRequestInput,
    requestedByUserId: string
  ): Promise<AsyncReportResponse> {
    const reportNumber = await this.repository.generateReportNumber();

    // 1. Create persistent report request record in PostgreSQL
    const requestRecord = await this.repository.createReportRequest({
      reportNumber,
      reportType: input.reportType,
      storeId: input.storeId,
      requestedByUserId,
      parameters: input.parameters,
    });

    // 2. Enqueue background processing job
    const queueManager = getQueueManager();
    const reportsQueue = queueManager.getQueue<ReportGenerationPayload>(QUEUE_NAMES.REPORTS);

    await reportsQueue.add(
      `generate_${input.reportType.toLowerCase()}`,
      {
        reportRequestId: requestRecord.reportRequestId,
        reportType: input.reportType,
        storeId: input.storeId,
        parameters: input.parameters as any,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      }
    );

    logger.info(
      { reportRequestId: requestRecord.reportRequestId, reportNumber, storeId: input.storeId },
      'Enqueued async report generation request'
    );

    return requestRecord;
  }

  public async getAsyncReportStatus(
    idOrNumber: string,
    authorizedStoreIds?: string[]
  ): Promise<AsyncReportResponse> {
    const report = await this.repository.getReportRequestByIdOrNumber(idOrNumber);
    if (!report) {
      throw new ReportNotFoundError(idOrNumber);
    }

    // Verify authorized access to store
    if (authorizedStoreIds && !authorizedStoreIds.includes(report.storeId)) {
      throw new ReportAccessDeniedError();
    }

    return report;
  }

  /**
   * General report generator function used by background workers
   */
  public async generateReportData(
    type: ReportGenerationPayload['reportType'],
    storeId: string,
    params: ReportGenerationPayload['parameters']
  ): Promise<{ data: unknown; count: number }> {
    const startDate = params.startDate
      ? new Date(params.startDate)
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const endDate = params.endDate ? new Date(params.endDate) : new Date();

    switch (type) {
      case 'SALES_SUMMARY': {
        const res = await this.repository.getSalesSummary(
          storeId,
          startDate,
          endDate,
          params.groupBy ?? 'day'
        );
        return { data: res, count: res.totalOrders };
      }
      case 'TOP_PRODUCTS': {
        const res = await this.repository.getTopProducts(
          storeId,
          startDate,
          endDate,
          params.limit ?? 20
        );
        return { data: res, count: res.items.length };
      }
      case 'PAYMENT_SUMMARY': {
        const res = await this.repository.getPaymentSummary(storeId, startDate, endDate);
        return { data: res, count: res.totalPaymentsCount };
      }
      case 'INVENTORY_SUMMARY': {
        const res = await this.repository.getInventorySummary(storeId, undefined, 1, 1000);
        return { data: res, count: res.totalCount };
      }
      case 'LOW_STOCK': {
        const res = await this.repository.getLowStockItems(storeId, 1, 1000);
        return { data: res, count: res.totalCount };
      }
      case 'PROCUREMENT_SUMMARY': {
        const res = await this.repository.getProcurementSummary(storeId, startDate, endDate);
        return { data: res, count: res.totalPurchaseOrders };
      }
      default:
        throw new Error(`Unsupported report type: ${type}`);
    }
  }
}
