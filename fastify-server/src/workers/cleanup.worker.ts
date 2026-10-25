import type { PrismaClient } from '@prisma/client';
import { BaseWorker } from './base.worker.js';
import { getQueueManager, QUEUE_NAMES } from '../infrastructure/queues/queue.service.js';
import type {
  CleanupExpiredRecordsPayload,
  CleanupExpiredRecordsResult,
} from '../jobs/cleanup-expired-records.job.js';
import { processCleanupExpiredRecordsJob } from '../jobs/cleanup-expired-records.job.js';

export function createCleanupWorker(
  prisma: PrismaClient,
  concurrency = 1
): BaseWorker<CleanupExpiredRecordsPayload, CleanupExpiredRecordsResult> {
  const queueManager = getQueueManager();
  const queue = queueManager.getQueue<CleanupExpiredRecordsPayload>(QUEUE_NAMES.CLEANUP);

  return new BaseWorker<CleanupExpiredRecordsPayload, CleanupExpiredRecordsResult>(
    'CleanupWorker',
    queue,
    async job => processCleanupExpiredRecordsJob(job, prisma),
    { concurrency }
  );
}
