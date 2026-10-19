import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './app-error.js';
import type { ApiErrorResponse } from '../types/index.js';
import { isPrismaError, mapPrismaError } from '../../infrastructure/database/database.errors.js';

/**
 * Maps standard HTTP status codes to conventional HTTP error names.
 */
function getHttpErrorName(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Bad Request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not Found';
    case 409:
      return 'Conflict';
    case 413:
      return 'Payload Too Large';
    case 422:
      return 'Unprocessable Entity';
    case 429:
      return 'Too Many Requests';
    case 500:
      return 'Internal Server Error';
    case 502:
      return 'Bad Gateway';
    case 503:
      return 'Service Unavailable';
    case 504:
      return 'Gateway Timeout';
    default:
      return statusCode >= 500 ? 'Internal Server Error' : 'Client Error';
  }
}

/**
 * Centralized Fastify error handler.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, request: FastifyRequest, reply: FastifyReply) => {
    const isProduction = process.env['NODE_ENV'] === 'production';
    const requestId = (request.id as string) || 'unknown';
    const timestamp = new Date().toISOString();

    // 1. Handle custom AppError instances
    if (error instanceof AppError) {
      if (!error.isOperational) {
        request.log.error(
          { err: error, requestId },
          `Non-operational application error: ${error.message}`
        );
      }

      const response: ApiErrorResponse = {
        statusCode: error.statusCode,
        error: getHttpErrorName(error.statusCode),
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
        requestId,
        timestamp,
      };

      return reply.status(error.statusCode).send(response);
    }

    // 2. Handle Prisma Database Engine Errors
    if (isPrismaError(error)) {
      const appError = mapPrismaError(error);
      request.log.error(
        { err: error, mappedCode: appError.code, requestId },
        `Database exception intercepted: ${appError.message}`
      );

      const response: ApiErrorResponse = {
        statusCode: appError.statusCode,
        error: getHttpErrorName(appError.statusCode),
        code: appError.code,
        message: appError.message,
        ...(appError.details !== undefined ? { details: appError.details } : {}),
        requestId,
        timestamp,
      };

      return reply.status(appError.statusCode).send(response);
    }

    // 3. Handle Fastify Schema / AJV Validation Errors
    const fastifyError = error as FastifyError;
    if (fastifyError.validation) {
      const response: ApiErrorResponse = {
        statusCode: 400,
        error: 'Bad Request',
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: fastifyError.validation.map(v => ({
          field: v.instancePath || (v.params ? JSON.stringify(v.params) : 'body'),
          message: v.message,
          keyword: v.keyword,
        })),
        requestId,
        timestamp,
      };

      return reply.status(400).send(response);
    }

    // 4. Handle Rate Limiting Plugin Errors
    if (fastifyError.statusCode === 429 || fastifyError.code === 'FST_ERR_RATE_LIMIT') {
      const response: ApiErrorResponse = {
        statusCode: 429,
        error: 'Too Many Requests',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded, please retry later.',
        requestId,
        timestamp,
      };

      return reply.status(429).send(response);
    }

    // 5. Handle Payload Too Large
    if (fastifyError.statusCode === 413 || fastifyError.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      const response: ApiErrorResponse = {
        statusCode: 413,
        error: 'Payload Too Large',
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds maximum allowed size.',
        requestId,
        timestamp,
      };

      return reply.status(413).send(response);
    }

    // 6. Handle Other Fastify Known HTTP Errors (e.g. 400 parsing errors)
    const statusCode =
      typeof fastifyError.statusCode === 'number' &&
      fastifyError.statusCode >= 400 &&
      fastifyError.statusCode < 600
        ? fastifyError.statusCode
        : 500;

    if (statusCode < 500) {
      const response: ApiErrorResponse = {
        statusCode,
        error: getHttpErrorName(statusCode),
        code: fastifyError.code || 'BAD_REQUEST',
        message: fastifyError.message || 'Client error occurred',
        requestId,
        timestamp,
      };

      return reply.status(statusCode).send(response);
    }

    // 7. Handle Unexpected / Unhandled Internal Errors (500)
    request.log.error(
      {
        err: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        requestId,
      },
      'Unhandled internal server error'
    );

    const internalResponse: ApiErrorResponse = {
      statusCode: 500,
      error: 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR',
      message: isProduction
        ? 'An unexpected error occurred. Please contact support with the request ID.'
        : error.message || 'Internal server error',
      ...(!isProduction && error.stack ? { details: { stack: error.stack } } : {}),
      requestId,
      timestamp,
    };

    return reply.status(500).send(internalResponse);
  });
}

/**
 * Centralized 404 Not Found handler for undefined routes.
 */
export function registerNotFoundHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    const requestId = (request.id as string) || 'unknown';
    const response: ApiErrorResponse = {
      statusCode: 404,
      error: 'Not Found',
      code: 'ROUTE_NOT_FOUND',
      message: `Route ${request.method} ${request.url} not found`,
      requestId,
      timestamp: new Date().toISOString(),
    };

    return reply.status(404).send(response);
  });
}
