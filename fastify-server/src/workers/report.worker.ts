import type { PrismaClient } from '@prisma/client';
import { BaseWorker } from './base.worker.js';
import { getQueueManager, QUEUE_NAMES } from '../infrastructure/queues/queue.service.js';
import type {
  ReportGenerationPayload,
  ReportGenerationResult,
} from '../jobs/report-generation.job.js';
import { processReportGenerationJob } from '../jobs/report-generation.job.js';

export function createReportWorker(
  prisma: PrismaClient,
  generateReportFn: (
    type: ReportGenerationPayload['reportType'],
    storeId: string,
    params: ReportGenerationPayload['parameters']
  ) => Promise<{ data: unknown; count: number }>,
  concurrency = 3
): BaseWorker<ReportGenerationPayload, ReportGenerationResult> {
  const queueManager = getQueueManager();
  const queue = queueManager.getQueue<ReportGenerationPayload>(QUEUE_NAMES.REPORTS);

  return new BaseWorker<ReportGenerationPayload, ReportGenerationResult>(
    'ReportWorker',
    queue,
    async job => processReportGenerationJob(job, prisma, generateReportFn),
    { concurrency }
  );
}
