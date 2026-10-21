import fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import type { PrismaClient } from '@prisma/client';
import { type Env, getEnv } from './config/env.js';
import { createLoggerOptions, generateOrValidateRequestId } from './common/utils/logger.js';
import { registerSecurityPlugins } from './plugins/security.js';
import { registerSwagger } from './plugins/swagger.js';
import { registerErrorHandler, registerNotFoundHandler } from './common/errors/error-handler.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { healthService } from './modules/health/health.service.js';
import { databasePlugin } from './infrastructure/database/database.plugin.js';
import { checkDatabaseConnection } from './infrastructure/database/prisma-client.js';
import { authenticationPlugin } from './plugins/authentication.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { storeRoutes } from './modules/stores/store.routes.js';
import { userRoutes, storeMemberRoutes } from './modules/users/user.routes.js';
import { categoryRoutes } from './modules/categories/category.routes.js';
import { productRoutes, variantRoutes } from './modules/products/product.routes.js';


export interface BuildAppOptions {
  env?: Env;
  fastifyOptions?: FastifyServerOptions;
  disableRateLimit?: boolean;
  /**
   * Mock or custom PrismaClient instance for testing isolation.
   */
  prismaOverride?: PrismaClient;
  /**
   * Option to skip database plugin registration (e.g. for lightweight unit tests).
   */
  skipDatabasePlugin?: boolean;
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

  // Register Cookie Plugin for secure Refresh Token transport (Stage 3)
  await app.register(fastifyCookie, {
    secret: env.COOKIE_SECRET,
    hook: 'onRequest',
  });

  // 4. Register OpenAPI Swagger Documentation (if enabled)
  await registerSwagger(app, env);

  // 5. Register Database Infrastructure & Health Integration (Stage 2)
  if (!options.skipDatabasePlugin) {
    await app.register(databasePlugin, {
      env,
      prismaOverride: options.prismaOverride,
    });

    // Register Authentication Plugin (Stage 3)
    await app.register(authenticationPlugin);

    // Register bounded PostgreSQL readiness check
    healthService.registerReadinessCheck('database', async () => {
      const result = await checkDatabaseConnection(app.prisma, 3000);
      if (result.isConnected) {
        return {
          status: 'up',
          message: 'PostgreSQL database connection is operational',
          latencyMs: result.latencyMs,
        };
      }
      return {
        status: 'down',
        message: 'PostgreSQL database connection is unavailable',
      };
    });
  }

  // 6. Register Versioned API Routes under API Prefix (e.g. /api/v1)
  await app.register(
    async apiV1 => {
      // Health observability probes
      await apiV1.register(healthRoutes, { prefix: '/health' });

      // API Routes (when database plugin is active)
      if (!options.skipDatabasePlugin) {
        // Stage 3: Authentication & Session Endpoints
        await apiV1.register(authRoutes, { prefix: '/auth' });

        // Stage 4: Store Management & Membership Endpoints
        await apiV1.register(storeRoutes, { prefix: '/stores' });
        await apiV1.register(storeMemberRoutes, { prefix: '/stores/:storeId/members' });

        // Stage 4: User Administration Endpoints
        await apiV1.register(userRoutes, { prefix: '/users' });

        // Stage 4: Product Category Endpoints
        await apiV1.register(categoryRoutes, { prefix: '/categories' });

        // Stage 4: Product Catalog & Variant Endpoints
        await apiV1.register(productRoutes, { prefix: '/products' });
        await apiV1.register(variantRoutes, { prefix: '/variants' });
      }
    },
    { prefix: env.API_PREFIX }
  );

  return app;
}

export default buildApp;
