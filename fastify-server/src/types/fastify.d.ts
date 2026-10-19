import type { FastifyRequest, FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Unique request correlation identifier.
     */
    id: string;
  }

  interface FastifyInstance {
    /**
     * Centralized PrismaClient instance for database persistence.
     */
    prisma: PrismaClient;
  }
}
