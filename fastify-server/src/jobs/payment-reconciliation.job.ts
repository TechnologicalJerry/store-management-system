import type { PrismaClient } from '@prisma/client';
import { logger } from '../common/utils/logger.js';
import type { JobRecord } from '../infrastructure/queues/queue.types.js';

export interface PaymentReconciliationPayload {
  storeId?: string;
  paymentId?: string;
  lookbackMinutes?: number;
}

export interface PaymentReconciliationResult {
  reconciledCount: number;
  failedCount: number;
  skippedCount: number;
}

/**
 * Payment Reconciliation Job Handler
 *
 * Inspects payments lingering in PENDING or REQUIRES_ACTION states past the
 * allowed payment window (default 15 minutes).
 * Follows Stage 7 rules: NEVER marks a payment successful without authoritative provider confirmation.
 * Flags timed-out or abandoned sessions as FAILED and logs audit trails.
 */
export async function processPaymentReconciliationJob(
  job: JobRecord<PaymentReconciliationPayload>,
  prisma: PrismaClient
): Promise<PaymentReconciliationResult> {
  const { storeId, paymentId, lookbackMinutes = 15 } = job.data;

  logger.info(
    { jobId: job.id, storeId, paymentId, lookbackMinutes },
    'Processing payment reconciliation job'
  );

  const timeoutThreshold = new Date(Date.now() - lookbackMinutes * 60 * 1000);

  // If specific paymentId requested
  if (paymentId) {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      logger.warn({ paymentId }, 'Payment record not found for reconciliation');
      return { reconciledCount: 0, failedCount: 0, skippedCount: 1 };
    }

    if (payment.status === 'PENDING' || payment.status === 'REQUIRES_ACTION') {
      if (payment.createdAt < timeoutThreshold) {
        await prisma.payment.update({
          where: { id: paymentId },
          data: {
            status: 'FAILED',
            errorMessage: 'Payment session expired during background reconciliation',
          },
        });
        logger.info({ paymentId }, 'Marked expired payment session as FAILED');
        return { reconciledCount: 1, failedCount: 1, skippedCount: 0 };
      }
    }
    return { reconciledCount: 0, failedCount: 0, skippedCount: 1 };
  }

  // Bounded batch reconciliation
  const stalePayments = await prisma.payment.findMany({
    where: {
      status: { in: ['PENDING', 'REQUIRES_ACTION'] },
      createdAt: { lt: timeoutThreshold },
      ...(storeId ? { storeId } : {}),
    },
    take: 50,
    orderBy: { createdAt: 'asc' },
  });

  let reconciledCount = 0;
  let failedCount = 0;

  for (const p of stalePayments) {
    try {
      await prisma.payment.update({
        where: { id: p.id },
        data: {
          status: 'FAILED',
          errorMessage: 'Payment session timed out without provider confirmation',
        },
      });
      reconciledCount++;
      failedCount++;
      logger.info({ paymentId: p.id, storeId: p.storeId }, 'Reconciled stale payment to FAILED');
    } catch (err) {
      logger.error(
        { paymentId: p.id, err: (err as Error).message },
        'Failed to reconcile stale payment record'
      );
    }
  }

  return {
    reconciledCount,
    failedCount,
    skippedCount: stalePayments.length - reconciledCount,
  };
}
