/**
 * Queue & Background Job Contracts and Interfaces
 *
 * Defines typed specifications for job payloads, queue options, worker handlers,
 * retry strategies, metrics, and lifecycle hooks.
 * Designed to cleanly map to BullMQ when installed during post-Stage 10 verification.
 */

export interface BackoffOptions {
  type: 'exponential' | 'fixed';
  delay: number;
}

export interface JobOptions {
  jobId?: string;
  attempts?: number;
  backoff?: BackoffOptions;
  delay?: number;
  timeout?: number;
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
}

export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';

export interface JobRecord<T = unknown> {
  id: string;
  name: string;
  data: T;
  opts: JobOptions;
  status: JobStatus;
  attemptsMade: number;
  maxAttempts: number;
  failedReason?: string;
  returnvalue?: unknown;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
}

export interface QueueMetrics {
  waitingCount: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
  delayedCount: number;
}

export interface IQueue<T = unknown> {
  readonly name: string;
  add(name: string, data: T, opts?: JobOptions): Promise<JobRecord<T>>;
  getJob(jobId: string): Promise<JobRecord<T> | null>;
  getMetrics(): Promise<QueueMetrics>;
  clean(graceMs: number, status: 'completed' | 'failed'): Promise<number>;
  close(): Promise<void>;
}

export interface WorkerOptions {
  concurrency?: number;
  lockDurationMs?: number;
}

export type JobProcessor<T = unknown, R = unknown> = (job: JobRecord<T>) => Promise<R>;

export interface IWorker<T = unknown, R = unknown> {
  readonly name: string;
  start(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  close(): Promise<void>;
  isRunning(): boolean;
}
