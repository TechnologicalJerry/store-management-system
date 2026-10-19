import { randomUUID } from 'node:crypto';
import type { FastifyLoggerOptions } from 'fastify';
import type { PinoLoggerOptions } from 'fastify/types/logger.js';
import type { Env } from '../../config/env.js';

/**
 * Validates an incoming client request ID or generates a secure fallback UUID.
 * Enforces strict alphanumeric and dash/underscore characters to prevent log injection.
 */
const REQUEST_ID_REGEX = /^[a-zA-Z0-9_\-]{1,64}$/;

export function generateOrValidateRequestId(headerValue?: string | string[]): string {
  const candidate = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (candidate && REQUEST_ID_REGEX.test(candidate)) {
    return candidate;
  }
  return randomUUID();
}

/**
 * Sanitizes headers for safe logging without exposing sensitive tokens or credentials.
 */
export function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = new Set([
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'proxy-authorization',
  ]);

  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveKeys.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Constructs Fastify-compatible Pino logger options according to the runtime environment.
 */
export function createLoggerOptions(env: Env): FastifyLoggerOptions & PinoLoggerOptions {
  const isDev = env.NODE_ENV === 'development';

  const baseConfig: FastifyLoggerOptions & PinoLoggerOptions = {
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["set-cookie"]',
        'req.headers["x-api-key"]',
        'req.body.password',
        'req.body.confirmPassword',
        'req.body.token',
        'req.body.secret',
        'req.body.creditCard',
        'req.body.databaseUrl',
        '*.databaseUrl',
        '*.DATABASE_URL',
        '*.DATABASE_DIRECT_URL',
      ],
      censor: '[REDACTED]',
    },
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          path: req.routerPath,
          headers: sanitizeHeaders(req.headers as Record<string, string | string[] | undefined>),
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  };

  if (isDev) {
    return {
      ...baseConfig,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    };
  }

  return baseConfig;
}
