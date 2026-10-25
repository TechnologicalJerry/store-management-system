import type { PrismaClient } from '@prisma/client';
import { logger } from '../common/utils/logger.js';
import type { JobRecord } from '../infrastructure/queues/queue.types.js';

export interface ReportGenerationPayload {
  reportRequestId: string;
  reportType: 'SALES_SUMMARY' | 'TOP_PRODUCTS' | 'PAYMENT_SUMMARY' | 'INVENTORY_SUMMARY' | 'LOW_STOCK' | 'PROCUREMENT_SUMMARY';
  storeId: string;
  parameters: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    groupBy?: 'day' | 'week' | 'month';
    [key: string]: unknown;
  };
}

export interface ReportGenerationResult {
  reportRequestId: string;
  status: 'COMPLETED' | 'FAILED';
  recordsGenerated: number;
}

/**
 * Report Generation Job Handler
 *
 * Asynchronously calculates and compiles heavy analytics and multi-month reports.
 * Persists bounded result payloads in PostgreSQL `report_requests` with a 7-day expiration window.
 * Strictly idempotent: will not recompute if the report request is already completed.
 */
export async function processReportGenerationJob(
  job: JobRecord<ReportGenerationPayload>,
  prisma: PrismaClient,
  generateReportFn: (
    type: ReportGenerationPayload['reportType'],
    storeId: string,
    params: ReportGenerationPayload['parameters']
  ) => Promise<{ data: unknown; count: number }>
): Promise<ReportGenerationResult> {
  const { reportRequestId, reportType, storeId, parameters } = job.data;

  logger.info(
    { jobId: job.id, reportRequestId, reportType, storeId },
    'Processing async report generation job'
  );

  // 1. Fetch current report request status to ensure idempotency
  const reportRequest = await prisma.reportRequest.findUnique({
    where: { id: reportRequestId },
  });

  if (!reportRequest) {
    throw new Error(`ReportRequest with ID '${reportRequestId}' not found`);
  }

  if (reportRequest.status === 'COMPLETED') {
    logger.info({ reportRequestId }, 'Report already marked completed. Skipping re-generation.');
    return {
      reportRequestId,
      status: 'COMPLETED',
      recordsGenerated: 0,
    };
  }

  // 2. Transition status to PROCESSING
  await prisma.reportRequest.update({
    where: { id: reportRequestId },
    data: { status: 'PROCESSING' },
  });

  try {
    // 3. Execute report computation via reporting service
    const { data, count } = await generateReportFn(reportType, storeId, parameters);

    // 4. Save results with 7-day retention expiry
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await prisma.reportRequest.update({
      where: { id: reportRequestId },
      data: {
        status: 'COMPLETED',
        resultData: data as any,
        completedAt: new Date(),
        expiresAt,
        errorMessage: null,
      },
    });

    logger.info(
      { reportRequestId, recordsGenerated: count },
      'Async report generation completed successfully'
    );

    return {
      reportRequestId,
      status: 'COMPLETED',
      recordsGenerated: count,
    };
  } catch (err) {
    const errorMsg = (err as Error).message.slice(0, 500);
    logger.error(
      { reportRequestId, error: errorMsg },
      'Async report generation job failed'
    );

    await prisma.reportRequest.update({
      where: { id: reportRequestId },
      data: {
        status: 'FAILED',
        errorMessage: errorMsg,
        completedAt: new Date(),
      },
    });

    throw err;
  }
}
