import type { FastifyPluginAsync } from 'fastify';
import { healthService } from './health.service.js';
import {
  livenessSchema,
  readinessSchema,
  diagnosticsSchema,
  metricsSchema,
} from './health.schema.js';
import { getMetricsService } from '../../infrastructure/observability/metrics.service.js';
import { getRedisClient } from '../../infrastructure/redis/redis-client.js';
import { getQueueManager } from '../../infrastructure/queues/queue.service.js';
import { requireRoles } from '../../plugins/authorization.js';

/**
 * Health & Observability module route definitions.
 */
export const healthRoutes: FastifyPluginAsync = async app => {
  // GET /live -> Process liveness check (unauthenticated public probe)
  app.get('/live', { schema: livenessSchema }, async (_request, reply) => {
    const liveness = healthService.getLiveness();
    return reply.status(200).send(liveness);
  });

  // GET /ready -> Application and dependency readiness check (unauthenticated public probe)
  app.get('/ready', { schema: readinessSchema }, async (_request, reply) => {
    const { isReady, response } = await healthService.getReadiness();
    const statusCode = isReady ? 200 : 503;
    return reply.status(statusCode).send(response);
  });

  // GET /diagnostics -> Restricted administrative diagnostic probe
  app.get(
    '/diagnostics',
    {
      preHandler: [requireRoles('SUPER_ADMIN', 'ADMIN')],
      schema: diagnosticsSchema,
    },
    async (_request, reply) => {
      const redisClient = getRedisClient();
      const queueManager = getQueueManager();

      const [redisHealth, queueMetrics] = await Promise.all([
        redisClient.getHealth(),
        queueManager.getAllMetrics(),
      ]);

      const diagnostics = await healthService.getDiagnostics({
        redis: {
          status: redisHealth.status,
          latencyMs: redisHealth.latencyMs,
          metrics: redisClient.getMetrics(),
        },
        queues: queueMetrics,
      });

      return reply.status(200).send({
        success: true,
        data: diagnostics,
      });
    }
  );

  // GET /metrics -> Operational metrics exposition
  app.get(
    '/metrics',
    {
      schema: metricsSchema,
    },
    async (request, reply) => {
      const metricsService = getMetricsService();
      const acceptHeader = request.headers['accept'] || '';

      if (acceptHeader.includes('text/plain')) {
        return reply
          .status(200)
          .header('content-type', 'text/plain; version=0.0.4; charset=utf-8')
          .send(metricsService.toPrometheusFormat());
      }

      return reply.status(200).send({
        success: true,
        data: metricsService.getSummary(),
      });
    }
  );
};
