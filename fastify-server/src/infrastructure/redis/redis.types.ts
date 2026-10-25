/**
 * Redis Infrastructure Types and Interfaces
 *
 * Defines contracts for Redis connection lifecycle, client operations,
 * caching options, health checks, and metrics.
 */

export interface RedisConnectionConfig {
  url?: string;
  host: string;
  port: number;
  password?: string;
  tlsEnabled?: boolean;
  connectTimeoutMs?: number;
  maxRetriesPerRequest?: number;
}

export interface RedisHealthResult {
  isConnected: boolean;
  status: 'connected' | 'connecting' | 'disconnected' | 'degraded' | 'error';
  latencyMs?: number;
  message: string;
}

export interface RedisMetrics {
  totalCommandsExecuted: number;
  successfulCommands: number;
  failedCommands: number;
  cacheHits: number;
  cacheMisses: number;
  lastConnectedAt?: Date;
  lastDisconnectedAt?: Date;
}

export interface IRedisClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<string>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<boolean>;
  del(key: string): Promise<boolean>;
  delPattern(pattern: string): Promise<number>;
  scan(cursor: number, pattern?: string, count?: number): Promise<[number, string[]]>;
  exists(key: string): Promise<boolean>;
  isConnected(): boolean;
  getStatus(): string;
  getMetrics(): RedisMetrics;
  getHealth(): Promise<RedisHealthResult>;
}

export interface CacheOptions {
  ttlSeconds?: number;
  version?: string;
  namespace?: string;
}
