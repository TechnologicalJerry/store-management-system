import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BaseWorker } from '../../src/workers/base.worker.js';
import { StandardQueue } from '../../src/infrastructure/queues/queue.service.js';
import { processReportGenerationJob } from '../../src/jobs/report-generation.job.js';
import { processPaymentReconciliationJob } from '../../src/jobs/payment-reconciliation.job.js';
import { processCleanupExpiredRecordsJob } from '../../src/jobs/cleanup-expired-records.job.js';

describe('Worker Infrastructure (Unit)', () => {
  let queue: StandardQueue<any>;

  beforeEach(() => {
    queue = new StandardQueue<any>('unit_worker_queue');
  });

  it('BaseWorker executes jobs and transitions status to completed', async () => {
    let executed = false;
    const processor = async (job: any) => {
      executed = true;
      return { ok: true };
    };

    const worker = new BaseWorker('TestWorker', queue, processor, { concurrency: 1 });
    const job = await queue.add('test_job', { data: 123 });

    await worker.start();

    // Trigger one manual tick or wait brief moment
    await (worker as any).executeJob(job);

    expect(executed).toBe(true);
    expect(job.status).toBe('completed');
    expect(job.returnvalue).toEqual({ ok: true });

    await worker.close();
  });

  it('BaseWorker schedules retries with exponential backoff on failure', async () => {
    let callCount = 0;
    const processor = async () => {
      callCount++;
      throw new Error('Temporary failure');
    };

    const worker = new BaseWorker('RetryWorker', queue, processor, { concurrency: 1 });
    const job = await queue.add(
      'failing_job',
      {},
      { attempts: 3, backoff: { type: 'exponential', delay: 100 } }
    );

    // Execute first attempt
    await (worker as any).executeJob(job);

    expect(callCount).toBe(1);
    expect(job.attemptsMade).toBe(1);
    expect(job.status).toBe('delayed');

    // Execute through max attempts
    await (worker as any).executeJob(job);
    await (worker as any).executeJob(job);

    expect(job.status).toBe('failed');
    expect(job.attemptsMade).toBe(3);

    await worker.close();
  });

  it('processReportGenerationJob completes report and stores resultData idempotently', async () => {
    const mockPrisma: any = {
      reportRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'req-1',
          status: 'PENDING',
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const mockGenerate = vi.fn().mockResolvedValue({
      data: { sales: '100.00' },
      count: 1,
    });

    const jobRecord: any = {
      id: 'job-1',
      data: {
        reportRequestId: 'req-1',
        reportType: 'SALES_SUMMARY',
        storeId: 'store-1',
        parameters: {},
      },
    };

    const result = await processReportGenerationJob(jobRecord, mockPrisma, mockGenerate);

    expect(result.status).toBe('COMPLETED');
    expect(result.recordsGenerated).toBe(1);
    expect(mockPrisma.reportRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'req-1' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          resultData: { sales: '100.00' },
        }),
      })
    );
  });

  it('processPaymentReconciliationJob flags stale pending payments as FAILED', async () => {
    const staleDate = new Date(Date.now() - 30 * 60 * 1000); // 30 mins ago
    const mockPrisma: any = {
      payment: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'pay-1', storeId: 'store-1', createdAt: staleDate },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    };

    const jobRecord: any = {
      id: 'job-2',
      data: { lookbackMinutes: 15 },
    };

    const result = await processPaymentReconciliationJob(jobRecord, mockPrisma);

    expect(result.reconciledCount).toBe(1);
    expect(result.failedCount).toBe(1);
    expect(mockPrisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'pay-1' },
      data: expect.objectContaining({ status: 'FAILED' }),
    });
  });

  it('processCleanupExpiredRecordsJob releases expired stock reservations and deletes old records', async () => {
    const mockPrisma: any = {
      stockReservation: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'res-1', storeId: 'store-1', variantId: 'var-1', quantity: 5 },
        ]),
      },
      outboxEvent: {
        deleteMany: vi.fn().mockResolvedValue({ count: 12 }),
      },
      reportRequest: {
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      $transaction: vi.fn().mockImplementation(async cb => {
        const tx = {
          stockReservation: {
            findUnique: vi.fn().mockResolvedValue({ id: 'res-1', status: 'ACTIVE' }),
            update: vi.fn(),
          },
          inventoryBalance: {
            update: vi.fn(),
          },
        };
        return cb(tx);
      }),
    };

    const jobRecord: any = {
      id: 'job-3',
      data: { cleanReservations: true, cleanOutbox: true, cleanReports: true },
    };

    const result = await processCleanupExpiredRecordsJob(jobRecord, mockPrisma);

    expect(result.reservationsExpired).toBe(1);
    expect(result.outboxRecordsCleaned).toBe(12);
    expect(result.reportsCleaned).toBe(3);
  });
});
