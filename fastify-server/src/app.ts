import fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { type Env, getEnv } from './config/env.js';
import { createLoggerOptions, generateOrValidateRequestId } from './common/utils/logger.js';
import { registerSecurityPlugins } from './plugins/security.js';
import { registerSwagger } from './plugins/swagger.js';
import { registerErrorHandler, registerNotFoundHandler } from './common/errors/error-handler.js';
import { healthRoutes } from './modules/health/health.routes.js';

export interface BuildAppOptions {
  env?: Env;
  fastifyOptions?: FastifyServerOptions;
  disableRateLimit?: boolean;
}

/**
 * Fastify Application Factory
 *
 * Configures and returns a fully initialized Fastify instance without binding to a network port.
 * Can be invoked multiple times in isolated testing environments or once in production.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? getEnv();

  // 1. Instantiate Fastify with safe logging and request ID configuration
  const app = fastify({
    logger: options.fastifyOptions?.logger ?? createLoggerOptions(env),
    genReqId: req => generateOrValidateRequestId(req.headers['x-request-id']),
    requestIdHeader: 'x-request-id',
    bodyLimit: 1048576, // 1MB maximum JSON/payload limit
    trustProxy: false, // Strict proxy trust policy; never trust arbitrary forwarded headers
    connectionTimeout: 10000,
    keepAliveTimeout: 5000,
    requestTimeout: 15000,
    ...options.fastifyOptions,
  });

  // 2. Register Centralized Error and Not-Found Handlers
  registerErrorHandler(app);
  registerNotFoundHandler(app);

  // 3. Register Security Foundation (Helmet, CORS, Rate Limiting)
  await registerSecurityPlugins(app, env, {
    rateLimitMax: options.disableRateLimit ? 100000 : 100,
  });

  // 4. Register OpenAPI Swagger Documentation (if enabled)
  await registerSwagger(app, env);

  // 5. Register Versioned API Routes under API Prefix (e.g. /api/v1)
  await app.register(
    async apiV1 => {
      // Health observability probes
      await apiV1.register(healthRoutes, { prefix: '/health' });
    },
    { prefix: env.API_PREFIX }
  );

  return app;
}

export default buildApp;
