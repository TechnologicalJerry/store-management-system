import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import type { Env } from '../config/env.js';

/**
 * Registers Swagger and Swagger UI plugins for OpenAPI documentation.
 */
export async function registerSwagger(app: FastifyInstance, env: Env): Promise<void> {
  if (!env.SWAGGER_ENABLED) {
    app.log.info('Swagger documentation is disabled by configuration');
    return;
  }

  // 1. OpenAPI Specification Generator
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Store Management System API',
        description:
          'Scalable, production-ready backend API for the Store Management System.\nStage 1 Foundation: Process lifecycle, health checks, security, and OpenAPI documentation.',
        version: '1.0.0',
        contact: {
          name: 'Store Management System Engineering Team',
        },
      },
      servers: [
        {
          url: env.API_PREFIX,
          description: 'Current environment API base path',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JWT Authorization header (implemented in Stage 3)',
          },
        },
        schemas: {
          ApiErrorResponse: {
            type: 'object',
            required: ['statusCode', 'error', 'code', 'message', 'requestId', 'timestamp'],
            properties: {
              statusCode: { type: 'integer', example: 400 },
              error: { type: 'string', example: 'Bad Request' },
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'Request validation failed' },
              details: {
                type: 'object',
                nullable: true,
                description: 'Additional validation or context details',
              },
              requestId: { type: 'string', example: 'e2b34a61-a083-424a-953e-52f085731b79' },
              timestamp: { type: 'string', format: 'date-time', example: '2026-10-18T22:00:00.000Z' },
            },
          },
        },
      },
      tags: [
        {
          name: 'Health',
          description: 'System liveness, readiness, and observability probes',
        },
      ],
    },
  });

  // 2. Interactive Swagger UI Explorer
  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
      displayRequestDuration: true,
    },
    staticCSP: true,
    transformStaticCSP: header => header,
  });

  app.log.info('Swagger documentation UI registered at /docs');
}
