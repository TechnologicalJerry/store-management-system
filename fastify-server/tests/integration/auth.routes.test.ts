import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { passwordService } from '../../src/modules/auth/password.service.js';
import { tokenService } from '../../src/modules/auth/token.service.js';

describe('Auth Routes (Integration)', () => {
  let app: FastifyInstance;
  let mockPrisma: PrismaClient;

  const testUserId = '550e8400-e29b-41d4-a716-446655440000';
  const otherUserId = '550e8400-e29b-41d4-a716-446655440099';
  const testSessionId = '660e8400-e29b-41d4-a716-446655440001';
  const otherSessionId = '660e8400-e29b-41d4-a716-446655440099';
  const testEmail = 'staff@store.local';
  let hashedPassword: string;

  beforeAll(async () => {
    hashedPassword = await passwordService.hashPassword('SecurePass123!');

    const sampleUser = {
      id: testUserId,
      email: testEmail,
      passwordHash: hashedPassword,
      name: 'Store Staff',
      status: 'ACTIVE',
      emailVerified: true,
      lastLoginAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      roles: [{ id: 'role-1', userId: testUserId, role: 'CASHIER', createdAt: new Date() }],
    };

    const sampleSession = {
      id: testSessionId,
      userId: testUserId,
      tokenFamily: '770e8400-e29b-41d4-a716-446655440002',
      tokenHash: 'sample-token-hash',
      status: 'ACTIVE',
      ipAddress: '127.0.0.1',
      userAgent: 'IntegrationTest/1.0',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      revokedAt: null,
      createdAt: new Date(),
      lastUsedAt: new Date(),
    };

    mockPrisma = {
      $transaction: vi.fn().mockImplementation(async (callback: (tx: any) => Promise<any>) => {
        return callback(mockPrisma);
      }),
      $disconnect: vi.fn().mockResolvedValue(undefined),
      user: {
        findUnique: vi.fn().mockImplementation(({ where }) => {
          if (where.email === testEmail || where.id === testUserId) {
            return Promise.resolve(sampleUser);
          }
          if (where.id === otherUserId) {
            return Promise.resolve({
              ...sampleUser,
              id: otherUserId,
              email: 'other@store.local',
            });
          }
          return Promise.resolve(null);
        }),
        create: vi.fn().mockImplementation(({ data }) => {
          return Promise.resolve({
            id: 'new-user-id',
            email: data.email,
            passwordHash: data.passwordHash,
            name: data.name,
            status: 'ACTIVE',
            emailVerified: false,
            lastLoginAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            roles: [{ id: 'role-new', userId: 'new-user-id', role: 'CASHIER' }],
          });
        }),
        update: vi.fn().mockResolvedValue(sampleUser),
      },
      session: {
        findUnique: vi.fn().mockImplementation(({ where }) => {
          if (where.id === testSessionId) {
            return Promise.resolve(sampleSession);
          }
          if (where.id === otherSessionId) {
            return Promise.resolve({
              ...sampleSession,
              id: otherSessionId,
              userId: otherUserId,
            });
          }
          return Promise.resolve(null);
        }),
        findFirst: vi.fn().mockImplementation(({ where }) => {
          if (where.tokenHash) {
            return Promise.resolve({
              ...sampleSession,
              user: sampleUser,
            });
          }
          return Promise.resolve(null);
        }),
        findMany: vi.fn().mockResolvedValue([sampleSession]),
        count: vi.fn().mockResolvedValue(1),
        create: vi.fn().mockResolvedValue(sampleSession),
        update: vi.fn().mockResolvedValue(sampleSession),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      authAudit: {
        create: vi.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    } as unknown as PrismaClient;

    const env = loadEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      SWAGGER_ENABLED: 'false',
      API_PREFIX: '/api/v1',
    });

    app = await buildApp({
      env,
      fastifyOptions: { logger: false },
      disableRateLimit: true,
      prismaOverride: mockPrisma,
    });
    await app.ready();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('POST /api/v1/auth/register', () => {
    it('should register a new user successfully and exclude passwordHash from output', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'brandnew@store.local',
          password: 'SecurePassword123!',
          name: 'New Associate',
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.statusCode).toBe(201);
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe('brandnew@store.local');
      expect(body.user.roles).toContain('CASHIER');
      expect(body.user.passwordHash).toBeUndefined();
    });

    it('should return 409 Conflict when attempting to register an existing email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: testEmail, // Existing email in mock
          password: 'SecurePassword123!',
          name: 'Duplicate Associate',
        },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.payload);
      expect(body.statusCode).toBe(409);
    });

    it('should return 400 Bad Request for short password', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: 'valid@store.local',
          password: 'short',
          name: 'Invalid User',
        },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should authenticate valid credentials, issue access token, and set HttpOnly cookie', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testEmail,
          password: 'SecurePass123!',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.tokens.accessToken).toBeDefined();
      expect(body.sessionId).toBe(testSessionId);
      expect(body.user.email).toBe(testEmail);

      // Verify Set-Cookie header contains HttpOnly signed refresh token
      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expect(String(setCookie)).toContain('refresh_token=');
      expect(String(setCookie)).toContain('HttpOnly');
    });

    it('should return 401 Unauthorized for incorrect password without enumeration leakage', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: testEmail,
          password: 'WrongPassword!',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.message).toBe('Invalid email or password.');
    });

    it('should return 401 Unauthorized for unknown email', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: 'unknown@store.local',
          password: 'SomePassword123!',
        },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.payload);
      expect(body.message).toBe('Invalid email or password.');
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should rotate refresh token and issue a new access token', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
        payload: {
          refreshToken: 'valid-refresh-token-hex-string',
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.tokens.accessToken).toBeDefined();
    });

    it('should return 401 Unauthorized when no refresh token is provided', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/refresh',
      });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should reject unauthenticated request with 401 Unauthorized', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
      });

      expect(response.statusCode).toBe(401);
    });

    it('should return current user profile and evaluated permissions for valid Bearer token', async () => {
      const validToken = tokenService.signAccessToken({
        sub: testUserId,
        email: testEmail,
        name: 'Store Staff',
        roles: ['CASHIER'],
        sessionId: testSessionId,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.user.id).toBe(testUserId);
      expect(body.user.email).toBe(testEmail);
      expect(body.user.permissions).toContain('sales:create');
    });
  });

  describe('GET /api/v1/auth/sessions', () => {
    it('should list sessions of the authenticated user', async () => {
      const validToken = tokenService.signAccessToken({
        sub: testUserId,
        email: testEmail,
        name: 'Store Staff',
        roles: ['CASHIER'],
        sessionId: testSessionId,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/sessions',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.sessions).toBeInstanceOf(Array);
      expect(body.sessions[0].id).toBe(testSessionId);
      // Ensure tokenHash is not leaked in output
      expect(body.sessions[0].tokenHash).toBeUndefined();
    });
  });

  describe('DELETE /api/v1/auth/sessions/:sessionId', () => {
    it('should allow user to revoke their own session', async () => {
      const validToken = tokenService.signAccessToken({
        sub: testUserId,
        email: testEmail,
        name: 'Store Staff',
        roles: ['CASHIER'],
        sessionId: testSessionId,
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/auth/sessions/${testSessionId}`,
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });

    it('should prevent non-admin user from revoking another user session with 403 Forbidden', async () => {
      const validToken = tokenService.signAccessToken({
        sub: testUserId,
        email: testEmail,
        name: 'Store Staff',
        roles: ['CASHIER'],
        sessionId: testSessionId,
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/v1/auth/sessions/${otherSessionId}`,
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(403);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should clear refresh cookie and return 200 OK', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);

      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toBeDefined();
    });
  });

  describe('POST /api/v1/auth/logout-all', () => {
    it('should revoke all user sessions when authenticated', async () => {
      const validToken = tokenService.signAccessToken({
        sub: testUserId,
        email: testEmail,
        name: 'Store Staff',
        roles: ['CASHIER'],
        sessionId: testSessionId,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/logout-all',
        headers: {
          authorization: `Bearer ${validToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
    });
  });
});
