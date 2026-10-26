import { beforeEach, describe, expect, it } from 'vitest';
import {
  StandardQueue,
  QueueManager,
  QUEUE_NAMES,
} from '../../src/infrastructure/queues/queue.service.js';

describe('QueueService (Unit)', () => {
  let queue: StandardQueue<{ task: string }>;

  beforeEach(() => {
    queue = new StandardQueue<{ task: string }>('test_queue');
  });

  it('enqueues jobs and assigns unique IDs and status', async () => {
    const job = await queue.add('test_job', { task: 'clean_tables' }, { attempts: 3 });

    expect(job.id).toBeDefined();
    expect(job.name).toBe('test_job');
    expect(job.data.task).toBe('clean_tables');
    expect(job.status).toBe('waiting');
    expect(job.maxAttempts).toBe(3);
    expect(job.attemptsMade).toBe(0);

    const fetched = await queue.getJob(job.id);
    expect(fetched).toEqual(job);
  });

  it('calculates queue metrics accurately', async () => {
    await queue.add('job_1', { task: 't1' });
    await queue.add('job_2', { task: 't2' });

    const metrics = await queue.getMetrics();
    expect(metrics.waitingCount).toBe(2);
    expect(metrics.activeCount).toBe(0);
    expect(metrics.completedCount).toBe(0);
    expect(metrics.failedCount).toBe(0);
  });

  it('cleans obsolete finished jobs based on grace period', async () => {
    const job = await queue.add('job_old', { task: 'old_task' });
    job.status = 'completed';
    job.finishedOn = Date.now() - 10000; // 10s ago

    const cleaned = await queue.clean(5000, 'completed');
    expect(cleaned).toBe(1);

    const fetched = await queue.getJob(job.id);
    expect(fetched).toBeNull();
  });

  it('QueueManager registers and maintains singleton named queues', () => {
    const manager = new QueueManager();
    const reportsQ = manager.getQueue(QUEUE_NAMES.REPORTS);
    const reconQ = manager.getQueue(QUEUE_NAMES.RECONCILIATION);
    const cleanupQ = manager.getQueue(QUEUE_NAMES.CLEANUP);

    expect(reportsQ.name).toBe(QUEUE_NAMES.REPORTS);
    expect(reconQ.name).toBe(QUEUE_NAMES.RECONCILIATION);
    expect(cleanupQ.name).toBe(QUEUE_NAMES.CLEANUP);

    // Re-getting returns the same instance
    expect(manager.getQueue(QUEUE_NAMES.REPORTS)).toBe(reportsQ);
  });
});
