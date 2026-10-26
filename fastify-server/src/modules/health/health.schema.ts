import type { FastifySchema } from 'fastify';

/**
 * Route schema for GET /health/live
 */
export const livenessSchema: FastifySchema = {
  description:
    'Liveness probe to determine whether the application process is running and responding to HTTP requests.',
  tags: ['Health'],
  summary: 'Application process liveness probe',
  response: {
    200: {
      description: 'The application process is healthy and active.',
      type: 'object',
      required: ['status', 'uptime', 'timestamp'],
      properties: {
        status: { type: 'string', example: 'ok' },
        uptime: { type: 'number', example: 120 },
        timestamp: { type: 'string', format: 'date-time', example: '2026-10-18T22:00:00.000Z' },
      },
    },
  },
};

/**
 * Route schema for GET /health/ready
 */
export const readinessSchema: FastifySchema = {
  description:
    'Readiness probe to determine whether the application is fully initialized and prepared to handle traffic.',
  tags: ['Health'],
  summary: 'Application readiness probe',
  response: {
    200: {
      description: 'The application and its critical subsystems are ready to accept traffic.',
      type: 'object',
      required: ['status', 'timestamp', 'uptime', 'checks'],
      properties: {
        status: { type: 'string', example: 'ready' },
        timestamp: { type: 'string', format: 'date-time', example: '2026-10-18T22:00:00.000Z' },
        uptime: { type: 'number', example: 120 },
        checks: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            required: ['status'],
            properties: {
              status: { type: 'string', enum: ['up', 'down', 'degraded'], example: 'up' },
              message: { type: 'string', example: 'Core application system is healthy and ready to accept traffic' },
              latencyMs: { type: 'number', example: 0.15 },
              details: { type: 'object', nullable: true },
            },
          },
        },
      },
    },
    503: {
      description: 'The application or one of its critical dependencies is unavailable.',
      type: 'object',
      required: ['status', 'timestamp', 'uptime', 'checks'],
      properties: {
        status: { type: 'string', example: 'unavailable' },
        timestamp: { type: 'string', format: 'date-time', example: '2026-10-18T22:00:00.000Z' },
        uptime: { type: 'number', example: 120 },
        checks: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            required: ['status'],
            properties: {
              status: { type: 'string', enum: ['up', 'down', 'degraded'], example: 'down' },
              message: { type: 'string', example: 'Subsystem failure' },
              latencyMs: { type: 'number', example: 12.5 },
              details: { type: 'object', nullable: true },
            },
          },
        },
      },
    },
  },
};

/**
 * Route schema for GET /health/diagnostics (Restricted Admin Probe)
 */
export const diagnosticsSchema: FastifySchema = {
  description: 'Restricted administrative diagnostics providing runtime state, memory, and subsystem health.',
  tags: ['Health'],
  summary: 'Administrative system diagnostics',
  response: {
    200: {
      description: 'System diagnostics report.',
      type: 'object',
      additionalProperties: true,
    },
  },
};

/**
 * Route schema for GET /health/metrics
 */
export const metricsSchema: FastifySchema = {
  description: 'Operational metrics including HTTP request counts, latency, and cache hit ratios.',
  tags: ['Health'],
  summary: 'Operational metrics summary',
  response: {
    200: {
      description: 'Operational metrics summary payload.',
      type: 'object',
      additionalProperties: true,
    },
  },
};
