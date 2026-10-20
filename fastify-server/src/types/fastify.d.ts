import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { AuthenticatedUser } from '../modules/auth/auth.types.js';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Unique request correlation identifier.
     */
    id: string;

    /**
     * Authenticated user context populated by the authentication plugin.
     */
    user?: AuthenticatedUser;
  }

  interface FastifyInstance {
    /**
     * Centralized PrismaClient instance for database persistence.
     */
    prisma: PrismaClient;

    /**
     * Pre-handler hook verifying JWT bearer tokens and active session validity.
     */
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
