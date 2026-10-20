import type { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import type { Env } from '../config/env.js';

export interface SecurityPluginOptions {
  rateLimitMax?: number;
  rateLimitTimeWindow?: string | number;
}

/**
 * Registers essential security plugins:
 * 1. @fastify/helmet - HTTP security headers
 * 2. @fastify/cors - Restrictive CORS origin allowlist
 * 3. @fastify/rate-limit - DDoS and brute-force mitigation
 */
export async function registerSecurityPlugins(
  app: FastifyInstance,
  env: Env,
  options?: SecurityPluginOptions
): Promise<void> {
  // 1. Helmet HTTP Security Headers
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: env.SWAGGER_ENABLED
      ? false // Disable CSP conflict when Swagger UI interactive docs are enabled
      : {
          directives: {
            defaultSrc: ["'self'"],
            baseUri: ["'self'"],
            fontSrc: ["'self'", 'https:', 'data:'],
            formAction: ["'self'"],
            frameAncestors: ["'self'"],
            imgSrc: ["'self'", 'data:'],
            objectSrc: ["'none'"],
            scriptSrc: ["'self'"],
            scriptSrcAttr: ["'none'"],
            styleSrc: ["'self'", 'https:'],
            upgradeInsecureRequests: [],
          },
        },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    crossOriginResourcePolicy: { policy: 'same-site' },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'deny' },
    hidePoweredBy: true,
    hsts:
      env.NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true,
  });

  // 2. Strict CORS Configuration
  await app.register(fastifyCors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (server-to-server, curl, health probes)
      if (!origin) {
        callback(null, true);
        return;
      }

      if (env.CORS_ORIGINS.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} is not allowed by CORS policy`), false);
    },
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Request-ID',
      'Accept',
      'Origin',
    ],
    exposedHeaders: ['X-Request-ID', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
    credentials: true,
    maxAge: 86400, // 24 hours
  });

  // 3. Rate Limiting Protection
  await app.register(fastifyRateLimit, {
    max: options?.rateLimitMax ?? 100,
    timeWindow: options?.rateLimitTimeWindow ?? '1 minute',
    allowList: ['127.0.0.1'],
    errorResponseBuilder: (request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit exceeded. Try again in ${context.after}.`,
      requestId: (request.id as string) || 'unknown',
      timestamp: new Date().toISOString(),
    }),
  });
}
