import type { FastifyPluginAsync } from 'fastify';
import { healthService } from './health.service.js';
import { livenessSchema, readinessSchema } from './health.schema.js';

/**
 * Health module route definitions.
 */
export const healthRoutes: FastifyPluginAsync = async app => {
  // GET /live -> Process liveness check
  app.get('/live', { schema: livenessSchema }, async (_request, reply) => {
    const liveness = healthService.getLiveness();
    return reply.status(200).send(liveness);
  });

  // GET /ready -> Application and dependency readiness check
  app.get('/ready', { schema: readinessSchema }, async (_request, reply) => {
    const { isReady, response } = await healthService.getReadiness();
    const statusCode = isReady ? 200 : 503;
    return reply.status(statusCode).send(response);
  });
};
