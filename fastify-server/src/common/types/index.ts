/**
 * Standard structured API error response contract returned to clients.
 */
export interface ApiErrorResponse {
  statusCode: number;
  error: string;
  code: string;
  message: string;
  details?: unknown;
  requestId: string;
  timestamp: string;
}

/**
 * Standard structured API success response wrapper.
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    requestId: string;
    timestamp: string;
    [key: string]: unknown;
  };
}

/**
 * System health status types.
 */
export type HealthStatus = 'ok' | 'degraded' | 'down';
export type ReadinessStatus = 'ready' | 'unavailable';

export interface ComponentHealthCheck {
  status: 'up' | 'down' | 'degraded';
  message?: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export interface ReadinessResponse {
  status: ReadinessStatus;
  timestamp: string;
  uptime: number;
  checks: Record<string, ComponentHealthCheck>;
}

export interface LivenessResponse {
  status: HealthStatus;
  uptime: number;
  timestamp: string;
}

export * from './pagination.js';

