import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { getEnv } from '../../config/env.js';
import { AuthRepository } from './auth.repository.js';
import { SessionService } from './session.service.js';
import { AuthService } from './auth.service.js';
import { tokenService } from './token.service.js';
import { ForbiddenError, UnauthorizedError } from '../../common/errors/app-error.js';
import type { RequestMetadata } from './auth.types.js';
import {
  getMeSchema,
  getSessionsSchema,
  loginSchema,
  logoutAllSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  revokeSessionSchema,
} from './auth.schemas.js';

/**
 * Extracts request metadata for security auditing.
 */
function extractMetadata(request: FastifyRequest): RequestMetadata {
  return {
    ipAddress: request.ip,
    userAgent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : undefined,
  };
}

/**
 * Authentication Route Plugin
 *
 * Exposes versioned endpoints for user registration, authentication, token rotation,
 * session management, and profile inspection.
 */
export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const env = getEnv();
  const authRepo = new AuthRepository(app.prisma);
  const sessionService = new SessionService(app.prisma, authRepo);
  const authService = new AuthService(app.prisma, authRepo, sessionService);

  const cookieName = env.AUTH_COOKIE_NAME;
  const cookiePath = `${env.API_PREFIX}/auth`;
  const isProduction = env.NODE_ENV === 'production';

  // 1. POST /api/v1/auth/register
  app.post(
    '/register',
    {
      schema: registerSchema,
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { email: string; password: string; name: string };
      const meta = extractMetadata(request);

      const result = await authService.register(body, meta);
      return reply.status(201).send({
        statusCode: 201,
        user: result.user,
      });
    }
  );

  // 2. POST /api/v1/auth/login
  app.post(
    '/login',
    {
      schema: loginSchema,
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { email: string; password: string };
      const meta = extractMetadata(request);

      const result = await authService.login(body, meta);

      // Set signed HttpOnly refresh cookie
      if (result.tokens.refreshToken) {
        reply.setCookie(cookieName, result.tokens.refreshToken, {
          httpOnly: true,
          secure: isProduction,
          sameSite: 'strict',
          path: cookiePath,
          maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
          signed: true,
        });
      }

      return reply.status(200).send({
        statusCode: 200,
        user: result.user,
        tokens: result.tokens,
        sessionId: result.sessionId,
      });
    }
  );

  // 3. POST /api/v1/auth/refresh
  app.post(
    '/refresh',
    {
      schema: refreshSchema,
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const body = request.body as { refreshToken?: string } | undefined;
      const meta = extractMetadata(request);

      let rawRefreshToken = body?.refreshToken;

      // Extract from signed cookie if not present in request body
      if (!rawRefreshToken && request.cookies) {
        const rawCookie = request.cookies[cookieName];
        if (rawCookie) {
          const unsigned = request.unsignCookie(rawCookie);
          rawRefreshToken = unsigned.valid ? unsigned.value : rawCookie;

          // Origin validation (CSRF defense for cookie-based transport)
          const origin = request.headers.origin;
          if (origin && !env.CORS_ORIGINS.includes(origin)) {
            throw new ForbiddenError('Cross-site refresh requests are not allowed.');
          }
        }
      }

      if (!rawRefreshToken) {
        throw new UnauthorizedError('Refresh token required in cookie or request body.');
      }

      const result = await authService.refresh(rawRefreshToken, meta);

      // Update cookie with rotated token
      if (result.tokens.refreshToken) {
        reply.setCookie(cookieName, result.tokens.refreshToken, {
          httpOnly: true,
          secure: isProduction,
          sameSite: 'strict',
          path: cookiePath,
          maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60,
          signed: true,
        });
      }

      return reply.status(200).send({
        statusCode: 200,
        tokens: result.tokens,
      });
    }
  );

  // 4. POST /api/v1/auth/logout
  app.post(
    '/logout',
    {
      schema: logoutSchema,
    },
    async (request, reply) => {
      const meta = extractMetadata(request);
      let sessionId: string | undefined;

      // Check if bearer token is provided
      const authHeader = request.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const claims = tokenService.verifyAccessToken(authHeader.substring(7));
          sessionId = claims.sessionId;
        } catch {
          // Ignore invalid access token during logout
        }
      }

      // If session ID is not resolved from access token, check refresh token
      if (!sessionId) {
        let rawRefreshToken = (request.body as { refreshToken?: string } | undefined)?.refreshToken;
        if (!rawRefreshToken && request.cookies) {
          const rawCookie = request.cookies[cookieName];
          if (rawCookie) {
            const unsigned = request.unsignCookie(rawCookie);
            rawRefreshToken = unsigned.valid ? unsigned.value : rawCookie;
          }
        }

        if (rawRefreshToken) {
          const tokenHash = tokenService.hashRefreshToken(rawRefreshToken);
          const session = await authRepo.findSessionByTokenHash(tokenHash);
          if (session) {
            sessionId = session.id;
          }
        }
      }

      if (sessionId) {
        await authService.logout(sessionId, meta);
      }

      // Always clear refresh cookie
      reply.clearCookie(cookieName, {
        path: cookiePath,
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
      });

      return reply.status(200).send({
        statusCode: 200,
        success: true,
        message: 'Logged out successfully.',
      });
    }
  );

  // 5. POST /api/v1/auth/logout-all
  app.post(
    '/logout-all',
    {
      schema: logoutAllSchema,
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const meta = extractMetadata(request);
      await authService.logoutAll(request.user!.id, meta);

      reply.clearCookie(cookieName, {
        path: cookiePath,
        httpOnly: true,
        secure: isProduction,
        sameSite: 'strict',
      });

      return reply.status(200).send({
        statusCode: 200,
        success: true,
        message: 'All active sessions revoked successfully.',
      });
    }
  );

  // 6. GET /api/v1/auth/me
  app.get(
    '/me',
    {
      schema: getMeSchema,
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const user = await authService.getMe(request.user!.id);
      return reply.status(200).send({
        statusCode: 200,
        user,
      });
    }
  );

  // 7. GET /api/v1/auth/sessions
  app.get(
    '/sessions',
    {
      schema: getSessionsSchema,
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const sessions = await authService.getUserSessions(
        request.user!.id,
        request.user!.sessionId
      );
      return reply.status(200).send({
        statusCode: 200,
        sessions,
      });
    }
  );

  // 8. DELETE /api/v1/auth/sessions/:sessionId
  app.delete(
    '/sessions/:sessionId',
    {
      schema: revokeSessionSchema,
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { sessionId } = request.params as { sessionId: string };
      await authService.revokeSession(
        request.user!.id,
        sessionId,
        request.user!.roles
      );

      return reply.status(200).send({
        statusCode: 200,
        success: true,
        message: 'Session revoked successfully.',
      });
    }
  );
};
