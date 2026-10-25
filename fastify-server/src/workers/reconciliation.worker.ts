import type { PrismaClient } from '@prisma/client';
import { BaseWorker } from './base.worker.js';
import { getQueueManager, QUEUE_NAMES } from '../infrastructure/queues/queue.service.js';
import type {
  PaymentReconciliationPayload,
  PaymentReconciliationResult,
} from '../jobs/payment-reconciliation.job.js';
import { processPaymentReconciliationJob } from '../jobs/payment-reconciliation.job.js';

export function createReconciliationWorker(
  prisma: PrismaClient,
  concurrency = 2
): BaseWorker<PaymentReconciliationPayload, PaymentReconciliationResult> {
  const queueManager = getQueueManager();
  const queue = queueManager.getQueue<PaymentReconciliationPayload>(QUEUE_NAMES.RECONCILIATION);

  return new BaseWorker<PaymentReconciliationPayload, PaymentReconciliationResult>(
    'ReconciliationWorker',
    queue,
    async job => processPaymentReconciliationJob(job, prisma),
    { concurrency }
  );
}
