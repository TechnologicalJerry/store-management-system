import crypto from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import { type Env, getEnv } from '../../config/env.js';
import type { AuthRepository } from './auth.repository.js';
import { tokenService, type TokenService } from './token.service.js';
import { UnauthorizedError } from '../../common/errors/app-error.js';
import type { AuthTokens, RequestMetadata, SessionView } from './auth.types.js';

export class SessionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly authRepository: AuthRepository,
    private readonly tokenSvc: TokenService = tokenService,
    private readonly env: Env = getEnv()
  ) {}

  /**
   * Creates a new session for an authenticated user, enforcing the active session limit.
   * If the user already has MAX_ACTIVE_SESSIONS, the oldest active session(s) are revoked (FIFO).
   */
  public async createSession(
    userId: string,
    meta?: RequestMetadata
  ): Promise<{ session: { id: string; tokenFamily: string }; tokens: { rawRefreshToken: string } }> {
    const { rawToken, tokenHash } = this.tokenSvc.generateRefreshToken();
    const tokenFamily = crypto.randomUUID();
    const expiresAt = this.tokenSvc.getRefreshTokenExpiryDate();

    // Execute inside transaction for strict concurrency protection
    const session = await this.prisma.$transaction(async tx => {
      // 1. Check current active session count
      const activeCount = await this.authRepository.countActiveSessionsByUserId(userId, tx);

      // 2. Enforce FIFO eviction if limit reached
      if (activeCount >= this.env.MAX_ACTIVE_SESSIONS) {
        const excess = activeCount - this.env.MAX_ACTIVE_SESSIONS + 1;
        await this.authRepository.revokeOldestActiveSessions(userId, excess, tx);
      }

      // 3. Create the new session
      return this.authRepository.createSession(
        {
          userId,
          refreshTokenHash: tokenHash,
          tokenFamily,
          expiresAt,
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
        },
        tx
      );
    });

    return {
      session: {
        id: session.id,
        tokenFamily: session.tokenFamily,
      },
      tokens: {
        rawRefreshToken: rawToken,
      },
    };
  }

  /**
   * Rotates a refresh token with automatic replay detection.
   * If a previously rotated token is re-used, the entire token family is revoked immediately.
   */
  public async rotateRefreshToken(
    rawRefreshToken: string,
    meta?: RequestMetadata
  ): Promise<{
    user: { id: string; email: string; name: string; roles: import('./auth.types.js').Role[] };
    sessionId: string;
    authTokens: AuthTokens;
  }> {
    if (!rawRefreshToken || typeof rawRefreshToken !== 'string') {
      throw new UnauthorizedError('Refresh token must be provided.');
    }

    const tokenHash = this.tokenSvc.hashRefreshToken(rawRefreshToken);

    // Look up session by token hash
    const session = await this.authRepository.findByRefreshTokenHash(tokenHash);

    // Replay detection: If token hash not found or session was already revoked
    if (!session || session.status !== 'ACTIVE') {
      if (session) {
        // Known session that was already revoked: potential theft detected!
        await this.authRepository.revokeTokenFamily(session.tokenFamily);
        await this.authRepository.createAudit({
          userId: session.userId,
          email: session.user.email,
          action: 'TOKEN_REUSE_DETECTED',
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
          metadata: {
            tokenFamily: session.tokenFamily,
            revokedSessionId: session.id,
          },
        });
      }

      throw new UnauthorizedError(
        'Invalid or previously rotated refresh token. Please sign in again.'
      );
    }

    // Check expiration
    if (session.expiresAt.getTime() <= Date.now()) {
      await this.authRepository.revokeSession(session.id);
      throw new UnauthorizedError('Refresh token has expired. Please sign in again.');
    }

    // Check account status
    if (session.user.status !== 'ACTIVE') {
      await this.authRepository.revokeAllUserSessions(session.userId);
      throw new UnauthorizedError('Account is no longer active.');
    }

    // Generate rotated refresh token
    const { rawToken: newRawToken, tokenHash: newHash } = this.tokenSvc.generateRefreshToken();
    const newExpiresAt = this.tokenSvc.getRefreshTokenExpiryDate();

    // Rotate atomically in transaction
    await this.prisma.$transaction(async tx => {
      await this.authRepository.rotateSessionToken(session.id, newHash, newExpiresAt, tx);
      await this.authRepository.createAudit(
        {
          userId: session.userId,
          email: session.user.email,
          action: 'TOKEN_REFRESH',
          ipAddress: meta?.ipAddress,
          userAgent: meta?.userAgent,
          metadata: { sessionId: session.id },
        },
        tx
      );
    });

    const userRoles = session.user.roles.map(r => r.role);

    // Sign new access token
    const accessToken = this.tokenSvc.signAccessToken({
      sub: session.user.id,
      email: session.user.email,
      name: session.user.name,
      roles: userRoles,
      sessionId: session.id,
    });

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        roles: userRoles,
      },
      sessionId: session.id,
      authTokens: {
        accessToken,
        refreshToken: newRawToken,
        expiresInSeconds: 900, // 15 minutes
      },
    };
  }

  /**
   * Revokes a specific session by its ID.
   */
  public async revokeSession(sessionId: string): Promise<void> {
    await this.authRepository.revokeSession(sessionId);
  }

  /**
   * Revokes all active sessions for a user.
   */
  public async revokeAllUserSessions(userId: string): Promise<void> {
    await this.authRepository.revokeAllUserSessions(userId);
  }

  /**
   * Lists sessions belonging to a user.
   */
  public async listUserSessions(
    userId: string,
    currentSessionId?: string
  ): Promise<SessionView[]> {
    const sessions = await this.authRepository.findUserSessions(userId);
    return sessions.map(s => ({
      id: s.id,
      tokenFamily: s.tokenFamily,
      status: s.status,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt.toISOString(),
      lastUsedAt: s.lastUsedAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      isCurrent: currentSessionId ? s.id === currentSessionId : undefined,
    }));
  }
}
