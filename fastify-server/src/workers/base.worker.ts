import { logger } from '../common/utils/logger.js';
import type {
  IWorker,
  JobProcessor,
  JobRecord,
  WorkerOptions,
} from '../infrastructure/queues/queue.types.js';
import { StandardQueue } from '../infrastructure/queues/queue.service.js';

/**
 * BaseWorker
 *
 * Generic worker processor managing queue subscription, concurrency,
 * exponential backoff retries, error isolation, and graceful shutdown.
 */
export class BaseWorker<T = unknown, R = unknown> implements IWorker<T, R> {
  public readonly name: string;
  private queue: StandardQueue<T>;
  private processor: JobProcessor<T, R>;
  private options: WorkerOptions;
  private running = false;
  private paused = false;
  private activeJobsCount = 0;
  private pollInterval?: NodeJS.Timeout;

  constructor(
    name: string,
    queue: StandardQueue<T>,
    processor: JobProcessor<T, R>,
    options?: WorkerOptions
  ) {
    this.name = name;
    this.queue = queue;
    this.processor = processor;
    this.options = {
      concurrency: options?.concurrency ?? 5,
      lockDurationMs: options?.lockDurationMs ?? 30000,
    };
  }

  public async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;
    this.paused = false;
    logger.info(
      { worker: this.name, concurrency: this.options.concurrency },
      'Background worker started'
    );

    // Continuous polling loop with unref timer
    this.pollInterval = setInterval(() => {
      void this.tick();
    }, 1000);

    if (this.pollInterval.unref) {
      this.pollInterval.unref();
    }
  }

  public async pause(): Promise<void> {
    this.paused = true;
    logger.info({ worker: this.name }, 'Background worker paused');
  }

  public async resume(): Promise<void> {
    this.paused = false;
    logger.info({ worker: this.name }, 'Background worker resumed');
  }

  public async close(): Promise<void> {
    this.running = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = undefined;
    }

    // Wait for active in-flight jobs to finish (up to 10 seconds)
    const startWait = Date.now();
    while (this.activeJobsCount > 0 && Date.now() - startWait < 10000) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info(
      { worker: this.name, remainingActive: this.activeJobsCount },
      'Background worker shutdown completed'
    );
  }

  public isRunning(): boolean {
    return this.running;
  }

  public getActiveJobsCount(): number {
    return this.activeJobsCount;
  }

  private async tick(): Promise<void> {
    if (!this.running || this.paused) {
      return;
    }

    while (
      this.running &&
      !this.paused &&
      this.activeJobsCount < (this.options.concurrency ?? 5)
    ) {
      const job = this.queue.getNextWaitingJob();
      if (!job) {
        break;
      }

      this.activeJobsCount++;
      job.status = 'active';
      job.processedOn = Date.now();

      void this.executeJob(job).finally(() => {
        this.activeJobsCount--;
      });
    }
  }

  private async executeJob(job: JobRecord<T>): Promise<void> {
    try {
      logger.info({ worker: this.name, jobId: job.id, jobName: job.name }, 'Executing job');
      const result = await this.processor(job);
      job.status = 'completed';
      job.returnvalue = result;
      job.finishedOn = Date.now();
      logger.info(
        { worker: this.name, jobId: job.id, durationMs: job.finishedOn - (job.processedOn ?? job.timestamp) },
        'Job completed successfully'
      );
    } catch (err) {
      job.attemptsMade++;
      const errorMsg = (err as Error).message;
      job.failedReason = errorMsg;

      if (job.attemptsMade >= job.maxAttempts) {
        job.status = 'failed';
        job.finishedOn = Date.now();
        logger.error(
          { worker: this.name, jobId: job.id, attemptsMade: job.attemptsMade, error: errorMsg },
          'Job failed permanently after max attempts'
        );
      } else {
        // Calculate retry backoff delay
        const backoffDelay = this.calculateBackoffDelay(job);
        job.status = 'delayed';
        logger.warn(
          {
            worker: this.name,
            jobId: job.id,
            attemptsMade: job.attemptsMade,
            nextRetryDelayMs: backoffDelay,
            error: errorMsg,
          },
          'Job failed, scheduling retry with backoff'
        );

        setTimeout(() => {
          if (job.status === 'delayed') {
            job.status = 'waiting';
          }
        }, backoffDelay);
      }
    }
  }

  private calculateBackoffDelay(job: JobRecord<T>): number {
    const backoff = job.opts.backoff;
    if (!backoff) {
      return 1000;
    }

    if (backoff.type === 'exponential') {
      return backoff.delay * Math.pow(2, job.attemptsMade - 1);
    }

    return backoff.delay;
  }
}
