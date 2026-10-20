import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { tokenService } from '../modules/auth/token.service.js';
import { getPermissionsForRoles } from './authorization.js';
import { UnauthorizedError } from '../common/errors/app-error.js';
import type { AuthenticatedUser } from '../modules/auth/auth.types.js';

/**
 * Authentication plugin decorating FastifyInstance with `authenticate` pre-handler.
 */
const authenticationPluginCallback: FastifyPluginAsync = async (app: FastifyInstance) => {
  const authenticate = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const authHeader = request.headers.authorization;
    if (!authHeader || typeof authHeader !== 'string') {
      throw new UnauthorizedError('Authorization header missing or invalid.');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedError('Bearer token required in Authorization header.');
    }

    // 1. Verify access token signature, issuer, audience, and expiration
    const claims = tokenService.verifyAccessToken(token);

    // 2. Verify user still exists and remains ACTIVE in the database
    const user = await app.prisma.user.findUnique({
      where: { id: claims.sub },
      include: { roles: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedError('User account not found, deactivated, or suspended.');
    }

    // 3. Verify session is still valid and has not been revoked
    const session = await app.prisma.session.findUnique({
      where: { id: claims.sessionId },
    });

    if (!session || session.status !== 'ACTIVE' || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedError('Session has expired or has been revoked. Please sign in again.');
    }

    const roles = user.roles.map(r => r.role);
    const permissions = getPermissionsForRoles(roles);

    // 4. Attach typed authenticated context to the request
    request.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      roles,
      permissions,
      sessionId: claims.sessionId,
    };
  };

  if (!app.hasDecorator('authenticate')) {
    app.decorate('authenticate', authenticate);
  }
};

export const authenticationPlugin = fp(authenticationPluginCallback, {
  name: 'authentication-plugin',
  fastify: '5.x',
  dependencies: ['database-plugin'],
});
