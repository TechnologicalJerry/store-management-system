import type { PrismaClient } from '@prisma/client';
import { logger } from '../common/utils/logger.js';
import type { JobRecord } from '../infrastructure/queues/queue.types.js';

export interface CleanupExpiredRecordsPayload {
  cleanReservations?: boolean;
  cleanOutbox?: boolean;
  cleanReports?: boolean;
}

export interface CleanupExpiredRecordsResult {
  reservationsExpired: number;
  outboxRecordsCleaned: number;
  reportsCleaned: number;
}

/**
 * Cleanup Expired Records Job Handler
 *
 * Releases inventory from abandoned stock reservations past their TTL.
 * Purges old processed outbox events and expired report payloads.
 * Ensures storage cleanliness and returns inventory to available pool.
 */
export async function processCleanupExpiredRecordsJob(
  job: JobRecord<CleanupExpiredRecordsPayload>,
  prisma: PrismaClient
): Promise<CleanupExpiredRecordsResult> {
  const { cleanReservations = true, cleanOutbox = true, cleanReports = true } = job.data;

  logger.info({ jobId: job.id }, 'Processing cleanup of expired system records');

  let reservationsExpired = 0;
  let outboxRecordsCleaned = 0;
  let reportsCleaned = 0;

  // 1. Release expired stock reservations
  if (cleanReservations) {
    const now = new Date();
    const expiredReservations = await prisma.stockReservation.findMany({
      where: {
        status: 'ACTIVE',
        expiresAt: { lt: now },
      },
      take: 100,
    });

    for (const res of expiredReservations) {
      try {
        await prisma.$transaction(async tx => {
          // Re-check status inside transaction
          const current = await tx.stockReservation.findUnique({
            where: { id: res.id },
          });

          if (!current || current.status !== 'ACTIVE') {
            return;
          }

          // Mark expired
          await tx.stockReservation.update({
            where: { id: res.id },
            data: { status: 'EXPIRED' },
          });

          // Decrement allocated quantity on balance
          await tx.inventoryBalance.update({
            where: {
              storeId_variantId: {
                storeId: res.storeId,
                variantId: res.variantId,
              },
            },
            data: {
              quantityReserved: {
                decrement: res.quantity,
              },
            },
          });
        });
        reservationsExpired++;
      } catch (err) {
        logger.warn(
          { reservationId: res.id, err: (err as Error).message },
          'Failed to expire stock reservation'
        );
      }
    }
  }

  // 2. Clean processed outbox records older than 7 days
  if (cleanOutbox) {
    const outboxThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const deleteResult = await prisma.outboxEvent.deleteMany({
      where: {
        status: 'PROCESSED',
        createdAt: { lt: outboxThreshold },
      },
    });
    outboxRecordsCleaned = deleteResult.count;
  }

  // 3. Clean expired report requests
  if (cleanReports) {
    const now = new Date();
    const reportDeleteResult = await prisma.reportRequest.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });
    reportsCleaned = reportDeleteResult.count;
  }

  logger.info(
    { reservationsExpired, outboxRecordsCleaned, reportsCleaned },
    'Completed cleanup of expired records'
  );

  return {
    reservationsExpired,
    outboxRecordsCleaned,
    reportsCleaned,
  };
}
