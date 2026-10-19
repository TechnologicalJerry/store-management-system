import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import type { PrismaClient } from '@prisma/client';
import type { Env } from '../../config/env.js';
import {
  type PrismaClientBundle,
  createPrismaClient,
  disconnectPrisma,
} from './prisma-client.js';

export interface DatabasePluginOptions {
  env: Env;
  /**
   * Optional mock or external PrismaClient instance for testing isolation.
   */
  prismaOverride?: PrismaClient;
}

/**
 * Fastify plugin that registers and manages the PrismaClient lifecycle.
 * Decorates FastifyInstance with `app.prisma` and registers an onClose hook
 * to gracefully drain connection pools during server shutdown.
 */
const databasePluginCallback: FastifyPluginAsync<DatabasePluginOptions> = async (
  app: FastifyInstance,
  options: DatabasePluginOptions
) => {
  let bundle: PrismaClientBundle | null = null;
  let client: PrismaClient;

  if (options.prismaOverride) {
    client = options.prismaOverride;
  } else {
    bundle = createPrismaClient(options.env);
    client = bundle.prisma;
  }

  // Decorate the Fastify instance with the type-safe prisma client
  if (!app.hasDecorator('prisma')) {
    app.decorate('prisma', client);
  }

  // Register clean shutdown hook
  app.addHook('onClose', async () => {
    app.log.info('Draining PostgreSQL pool and disconnecting Prisma client...');
    if (bundle) {
      await disconnectPrisma(bundle);
    } else if (options.prismaOverride) {
      await disconnectPrisma(options.prismaOverride);
    }
    app.log.info('Database resources cleanly released.');
  });
};

export const databasePlugin = fp(databasePluginCallback, {
  name: 'database-plugin',
  fastify: '5.x',
});
