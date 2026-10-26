/**
 * Standalone Background Job Worker Process
 *
 * Dedicated process entry point for processing asynchronous reports,
 * payment reconciliation, and periodic system cleanup jobs.
 * Kept strictly isolated from the HTTP API server process.
 */

import { getEnv } from './config/env.js';
import { logger } from './common/utils/logger.js';
import { createPrismaClient } from './infrastructure/database/prisma-client.js';
import { getRedisClient } from './infrastructure/redis/redis-client.js';
import { createReportWorker } from './workers/report.worker.js';
import { createReconciliationWorker } from './workers/reconciliation.worker.js';
import { createCleanupWorker } from './workers/cleanup.worker.js';
import { ReportService } from './modules/reports/report.service.js';

async function bootstrapWorker(): Promise<void> {
  const env = getEnv();

  logger.info(
    {
      env: env.NODE_ENV,
      concurrency: env.WORKER_CONCURRENCY,
      enabled: env.WORKER_ENABLED,
    },
    'Starting standalone background worker service...'
  );

  // 1. Initialize Prisma Database Connection
  const { prisma, pool } = createPrismaClient(env);

  // 2. Initialize Redis Connection
  const redis = getRedisClient();
  await redis.connect();

  // 3. Initialize Services and Workers
  const reportService = new ReportService(prisma);

  const reportWorker = createReportWorker(
    prisma,
    (type, storeId, params) => reportService.generateReportData(type, storeId, params),
    env.WORKER_CONCURRENCY
  );

  const reconciliationWorker = createReconciliationWorker(prisma, 2);
  const cleanupWorker = createCleanupWorker(prisma, 1);

  // 4. Start Worker Processors
  await reportWorker.start();
  await reconciliationWorker.start();
  await cleanupWorker.start();

  logger.info('All background workers operational and processing queue events');

  // 5. Graceful Shutdown Signal Handling
  let isShuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info({ signal }, 'Termination signal received. Draining workers and shutting down...');

    try {
      // Close workers (waits for active jobs to complete)
      await Promise.all([
        reportWorker.close(),
        reconciliationWorker.close(),
        cleanupWorker.close(),
      ]);

      // Disconnect Redis and PostgreSQL
      await redis.disconnect();
      await prisma.$disconnect();
      await pool.end();

      logger.info('Background worker process shut down cleanly.');
      process.exit(0);
    } catch (err) {
      logger.error({ err: (err as Error).message }, 'Error encountered during worker shutdown');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void handleShutdown('SIGINT'));
  process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
  process.on('unhandledRejection', reason => {
    logger.error({ reason }, 'Unhandled Promise Rejection detected in worker process');
  });
  process.on('uncaughtException', err => {
    logger.fatal({ err: err.message, stack: err.stack }, 'Uncaught Exception in worker process');
    process.exit(1);
  });
}

// Bootstrap standalone worker if this module is directly executed (dev with tsx or prod with node)
const isDirectlyExecuted =
  process.argv[1] &&
  (process.argv[1].endsWith('worker.ts') || process.argv[1].endsWith('worker.js'));

if (isDirectlyExecuted) {
  bootstrapWorker().catch(err => {
    logger.fatal({ err: (err as Error).message }, 'Failed to start background worker service');
    process.exit(1);
  });
}

export { bootstrapWorker };
