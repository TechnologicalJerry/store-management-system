import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportService } from '../../src/modules/reports/report.service.js';
import {
  InvalidDateRangeError,
  ReportDateRangeExceededError,
  ReportNotFoundError,
  ReportAccessDeniedError,
} from '../../src/modules/reports/report.errors.js';
import { CacheService } from '../../src/infrastructure/redis/cache.service.js';
import { RedisClient } from '../../src/infrastructure/redis/redis-client.js';

describe('ReportService (Unit)', () => {
  let mockPrisma: any;
  let reportService: ReportService;
  let cacheService: CacheService;
  const storeId = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(() => {
    mockPrisma = {
      sale: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      saleItem: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      payment: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      inventoryBalance: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      purchaseOrder: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      reportRequest: {
        create: vi.fn().mockResolvedValue({
          id: 'rep-req-1',
          reportNumber: 'REP-20261025-1001',
          reportType: 'SALES_SUMMARY',
          storeId,
          requestedByUserId: 'user-1',
          parameters: {},
          status: 'PENDING',
          createdAt: new Date(),
          completedAt: null,
          expiresAt: null,
          errorMessage: null,
          resultData: null,
        }),
        findFirst: vi.fn(),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ nextval: 1001 }]),
    };

    cacheService = new CacheService(new RedisClient());
    reportService = new ReportService(mockPrisma as any, cacheService);
  });

  it('rejects invalid date ranges where start is after end', async () => {
    await expect(
      reportService.getSalesSummary({
        storeId,
        startDate: '2026-10-25T00:00:00.000Z',
        endDate: '2026-10-20T00:00:00.000Z',
        groupBy: 'day',
      })
    ).rejects.toThrow(InvalidDateRangeError);
  });

  it('rejects date ranges exceeding maximum allowed synchronous window', async () => {
    // > 90 days
    await expect(
      reportService.getSalesSummary({
        storeId,
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-06-01T00:00:00.000Z',
        groupBy: 'day',
      })
    ).rejects.toThrow(ReportDateRangeExceededError);
  });

  it('enqueues an async report generation request properly', async () => {
    const response = await reportService.requestAsyncReport(
      {
        storeId,
        reportType: 'SALES_SUMMARY',
        parameters: { groupBy: 'day' },
      },
      'user-1'
    );

    expect(response.reportRequestId).toBe('rep-req-1');
    expect(response.status).toBe('PENDING');
    expect(mockPrisma.reportRequest.create).toHaveBeenCalled();
  });

  it('enforces store authorization check on async report polling', async () => {
    mockPrisma.reportRequest.findFirst.mockResolvedValue({
      id: 'rep-req-1',
      reportNumber: 'REP-20261025-1001',
      reportType: 'SALES_SUMMARY',
      storeId: 'different-store-id',
      status: 'COMPLETED',
      createdAt: new Date(),
    });

    // User only authorized for storeId, but report belongs to different-store-id
    await expect(
      reportService.getAsyncReportStatus('rep-req-1', [storeId])
    ).rejects.toThrow(ReportAccessDeniedError);
  });

  it('throws ReportNotFoundError when requested report ticket does not exist', async () => {
    mockPrisma.reportRequest.findFirst.mockResolvedValue(null);

    await expect(
      reportService.getAsyncReportStatus('missing-ticket', [storeId])
    ).rejects.toThrow(ReportNotFoundError);
  });
});
