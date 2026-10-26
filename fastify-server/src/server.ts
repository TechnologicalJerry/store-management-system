import type { FastifyInstance } from 'fastify';
import { loadEnv } from './config/env.js';
import { buildApp } from './app.js';

let app: FastifyInstance | null = null;
let isShuttingDown = false;

/**
 * Initiates graceful shutdown and closes all registered Fastify resources.
 */
export async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  // Bounded shutdown timer guarantees process termination if cleanup hangs
  const shutdownTimer = setTimeout(() => {
    console.error('CRITICAL: Graceful shutdown timed out. Forcing process termination.');
    process.exit(1);
  }, 10000);
  shutdownTimer.unref();

  if (app) {
    app.log.info(`Received ${signal}. Initiating graceful shutdown...`);
    try {
      await app.close();
      clearTimeout(shutdownTimer);
      app.log.info('Application HTTP server and resources closed cleanly.');
      process.exit(0);
    } catch (error) {
      clearTimeout(shutdownTimer);
      app.log.error({ err: error }, 'Error occurred during graceful shutdown');
      process.exit(1);
    }
  } else {
    clearTimeout(shutdownTimer);
    process.exit(0);
  }
}

/**
 * Main application bootstrap function.
 */
export async function startServer(): Promise<void> {
  let env;

  // 1. Validate environment configuration
  try {
    env = loadEnv();
  } catch (error) {
    console.error('CRITICAL: Environment validation failed during bootstrap:');
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  // 2. Build application and start network listener
  try {
    app = await buildApp({ env });

    const address = await app.listen({
      port: env.PORT,
      host: env.HOST,
    });

    app.log.info(
      { address, port: env.PORT, host: env.HOST, environment: env.NODE_ENV },
      'Store Management System Backend listening successfully'
    );
    app.log.info(`API Base Path: ${address}${env.API_PREFIX}`);

    if (env.SWAGGER_ENABLED) {
      app.log.info(`Swagger API Documentation: ${address}/docs`);
    }
  } catch (error) {
    if (app) {
      app.log.fatal({ err: error }, 'Server failed to start');
    } else {
      console.error('CRITICAL: Server startup failed:', error);
    }
    process.exit(1);
  }
}

// Register process termination handlers
process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

// Process error hooks
process.on('uncaughtException', error => {
  console.error('CRITICAL: Uncaught Exception:', error);
  if (app) {
    app.log.fatal({ err: error }, 'Uncaught exception detected');
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
  if (app) {
    app.log.fatal({ reason }, 'Unhandled promise rejection detected');
  }
  process.exit(1);
});

// Guard execution so importing during testing does not auto-bind to network sockets
if (process.env['NODE_ENV'] !== 'test') {
  void startServer();
}
