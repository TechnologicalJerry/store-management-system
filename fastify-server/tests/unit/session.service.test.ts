import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { SessionService } from '../../src/modules/auth/session.service.js';
import type { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { TokenService } from '../../src/modules/auth/token.service.js';
import { UnauthorizedError } from '../../src/common/errors/app-error.js';

describe('SessionService (Unit)', () => {
  let mockPrisma: PrismaClient;
  let mockAuthRepo: AuthRepository;
  let tokenService: TokenService;
  let sessionService: SessionService;

  const userId = '11111111-1111-4111-a111-111111111111';
  const sessionId = '22222222-2222-4222-a222-222222222222';
  const tokenFamily = '33333333-3333-4333-a333-333333333333';

  beforeEach(() => {
    tokenService = new TokenService();

    mockAuthRepo = {
      findSessionById: vi.fn(),
      findSessionByTokenHash: vi.fn(),
      countActiveSessions: vi.fn(),
      findOldestActiveSessions: vi.fn(),
      createSession: vi.fn(),
      updateSessionToken: vi.fn(),
      revokeSession: vi.fn(),
      revokeSessionsByTokenFamily: vi.fn(),
      revokeAllUserSessions: vi.fn(),
      createAudit: vi.fn(),
      getUserActiveSessions: vi.fn(),
    } as unknown as AuthRepository;

    mockPrisma = {
      $transaction: vi.fn().mockImplementation(async (callback: (tx: any) => Promise<any>) => {
        return callback(mockPrisma);
      }),
    } as unknown as PrismaClient;

    sessionService = new SessionService(mockPrisma, mockAuthRepo, tokenService);
  });

  describe('createSession and FIFO session limit enforcement', () => {
    it('should create session and issue raw refresh token', async () => {
      vi.mocked(mockAuthRepo.countActiveSessions).mockResolvedValue(0);
      vi.mocked(mockAuthRepo.createSession).mockResolvedValue({
        id: sessionId,
        userId,
        tokenFamily,
        tokenHash: 'hashed-token',
        status: 'ACTIVE',
        ipAddress: '127.0.0.1',
        userAgent: 'Vitest/TestAgent',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        revokedAt: null,
        createdAt: new Date(),
        lastUsedAt: new Date(),
      });

      const result = await sessionService.createSession(userId, {
        ipAddress: '127.0.0.1',
        userAgent: 'Vitest/TestAgent',
      });

      expect(result.session).toBeDefined();
      expect(result.tokens.rawRefreshToken).toBeDefined();
      expect(result.session.id).toBe(sessionId);
      expect(mockAuthRepo.createSession).toHaveBeenCalled();
    });

    it('should evict the oldest session when active sessions reach MAX_ACTIVE_SESSIONS limit', async () => {
      // Simulate user already has 2 active sessions (at max limit of 2)
      vi.mocked(mockAuthRepo.countActiveSessions).mockResolvedValue(2);
      vi.mocked(mockAuthRepo.findOldestActiveSessions).mockResolvedValue([
        { id: 'old-session-id' },
      ]);
      vi.mocked(mockAuthRepo.createSession).mockResolvedValue({
        id: sessionId,
        userId,
        tokenFamily,
        tokenHash: 'hashed-token',
        status: 'ACTIVE',
        ipAddress: null,
        userAgent: null,
        expiresAt: new Date(),
        revokedAt: null,
        createdAt: new Date(),
        lastUsedAt: new Date(),
      });

      await sessionService.createSession(userId);

      // Verify the oldest active session was revoked
      expect(mockAuthRepo.revokeSession).toHaveBeenCalledWith('old-session-id', expect.anything());
    });
  });

  describe('rotateRefreshToken and Replay Detection', () => {
    it('should rotate token successfully when presented with a valid active session token', async () => {
      const rawToken = tokenService.generateRawRefreshToken();
      const tokenHash = tokenService.hashRefreshToken(rawToken);

      vi.mocked(mockAuthRepo.findSessionByTokenHash).mockResolvedValue({
        id: sessionId,
        userId,
        tokenFamily,
        tokenHash,
        status: 'ACTIVE',
        ipAddress: '127.0.0.1',
        userAgent: null,
        expiresAt: new Date(Date.now() + 100000),
        revokedAt: null,
        createdAt: new Date(),
        lastUsedAt: new Date(),
        user: {
          id: userId,
          email: 'user@store.local',
          name: 'Regular User',
          status: 'ACTIVE',
          roles: [{ role: 'CASHIER' }],
        },
      } as any);

      const result = await sessionService.rotateRefreshToken(rawToken);

      expect(result.authTokens).toBeDefined();
      expect(result.authTokens.accessToken).toBeDefined();
      expect(result.authTokens.refreshToken).toBeDefined();
      expect(result.authTokens.refreshToken).not.toBe(rawToken);
      expect(mockAuthRepo.updateSessionToken).toHaveBeenCalled();
    });

    it('should detect reuse of a revoked token and revoke the entire token family', async () => {
      const reusedRawToken = tokenService.generateRawRefreshToken();
      const tokenHash = tokenService.hashRefreshToken(reusedRawToken);

      // Simulate database returning a session that was already REVOKED
      vi.mocked(mockAuthRepo.findSessionByTokenHash).mockResolvedValue({
        id: sessionId,
        userId,
        tokenFamily,
        tokenHash,
        status: 'REVOKED',
        ipAddress: null,
        userAgent: null,
        expiresAt: new Date(Date.now() + 100000),
        revokedAt: new Date(),
        createdAt: new Date(),
        lastUsedAt: new Date(),
        user: {
          id: userId,
          email: 'compromised@store.local',
          status: 'ACTIVE',
        },
      } as any);

      await expect(sessionService.rotateRefreshToken(reusedRawToken)).rejects.toThrow(
        UnauthorizedError
      );

      // Verification of token-family revocation on replay detection
      expect(mockAuthRepo.revokeSessionsByTokenFamily).toHaveBeenCalledWith(
        tokenFamily,
        expect.anything()
      );
      expect(mockAuthRepo.createAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REFRESH_REUSE_DETECTED',
        }),
        expect.anything()
      );
    });

    it('should reject an expired session with UnauthorizedError', async () => {
      const rawToken = tokenService.generateRawRefreshToken();
      const tokenHash = tokenService.hashRefreshToken(rawToken);

      vi.mocked(mockAuthRepo.findSessionByTokenHash).mockResolvedValue({
        id: sessionId,
        userId,
        tokenFamily,
        tokenHash,
        status: 'ACTIVE',
        ipAddress: null,
        userAgent: null,
        expiresAt: new Date(Date.now() - 5000), // Expired
        revokedAt: null,
        createdAt: new Date(),
        lastUsedAt: new Date(),
      } as any);

      await expect(sessionService.rotateRefreshToken(rawToken)).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('revokeSession and revokeAllUserSessions', () => {
    it('revokeSession should call repository revokeSession', async () => {
      await sessionService.revokeSession(sessionId);
      expect(mockAuthRepo.revokeSession).toHaveBeenCalledWith(sessionId);
    });

    it('revokeAllUserSessions should call repository revokeAllUserSessions', async () => {
      await sessionService.revokeAllUserSessions(userId);
      expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith(userId);
    });
  });
});
