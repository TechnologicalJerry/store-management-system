import type { PrismaClient } from '@prisma/client';
import type { DatabaseTransactionClient } from '../../infrastructure/database/database.types.js';
import type { AuthAuditAction, Role, SessionStatus, UserStatus } from './auth.types.js';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  name: string;
  roles: Role[];
}

export interface CreateSessionData {
  userId: string;
  refreshTokenHash: string;
  tokenFamily: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface CreateAuditData {
  userId?: string;
  email: string;
  action: AuthAuditAction;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export class AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: DatabaseTransactionClient) {
    return tx ?? this.prisma;
  }

  // =========================================================================
  // User Operations
  // =========================================================================

  public async findByEmail(email: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.user.findUnique({
      where: { email },
      include: {
        roles: true,
      },
    });
  }

  public async findById(id: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.user.findUnique({
      where: { id },
      include: {
        roles: true,
      },
    });
  }

  public async createUser(data: CreateUserData, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        roles: {
          create: data.roles.map(role => ({ role })),
        },
      },
      include: {
        roles: true,
      },
    });
  }

  public async updateLastLogin(userId: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }

  public async updateUserStatus(userId: string, status: UserStatus, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.user.update({
      where: { id: userId },
      data: { status },
    });
  }

  // =========================================================================
  // Session Operations
  // =========================================================================

  public async createSession(data: CreateSessionData, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.session.create({
      data: {
        userId: data.userId,
        refreshTokenHash: data.refreshTokenHash,
        tokenFamily: data.tokenFamily,
        expiresAt: data.expiresAt,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        status: 'ACTIVE',
      },
    });
  }

  public async findByRefreshTokenHash(hash: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.session.findUnique({
      where: { refreshTokenHash: hash },
      include: {
        user: {
          include: {
            roles: true,
          },
        },
      },
    });
  }

  public async findSessionById(sessionId: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.session.findUnique({
      where: { id: sessionId },
    });
  }

  public async findActiveSessionsByUserId(userId: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.session.findMany({
      where: {
        userId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  public async countActiveSessionsByUserId(userId: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.session.count({
      where: {
        userId,
        status: 'ACTIVE',
        expiresAt: { gt: new Date() },
      },
    });
  }

  public async revokeOldestActiveSessions(
    userId: string,
    countToRevoke: number,
    tx?: DatabaseTransactionClient
  ) {
    if (countToRevoke <= 0) return;
    const client = this.getClient(tx);

    const oldestSessions = await client.session.findMany({
      where: {
        userId,
        status: 'ACTIVE',
      },
      orderBy: { createdAt: 'asc' },
      take: countToRevoke,
      select: { id: true },
    });

    const ids = oldestSessions.map(s => s.id);
    if (ids.length > 0) {
      await client.session.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'REVOKED',
          revokedAt: new Date(),
        },
      });
    }
  }

  public async rotateSessionToken(
    sessionId: string,
    newHash: string,
    newExpiresAt: Date,
    tx?: DatabaseTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.session.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash: newHash,
        expiresAt: newExpiresAt,
        lastUsedAt: new Date(),
      },
    });
  }

  public async revokeSession(sessionId: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.session.update({
      where: { id: sessionId },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });
  }

  public async revokeTokenFamily(tokenFamily: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.session.updateMany({
      where: { tokenFamily },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });
  }

  public async revokeAllUserSessions(userId: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.session.updateMany({
      where: { userId, status: 'ACTIVE' },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });
  }

  public async findUserSessions(userId: string, limit = 20, offset = 0) {
    return this.prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
      select: {
        id: true,
        tokenFamily: true,
        status: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });
  }

  // =========================================================================
  // Audit Operations
  // =========================================================================

  public async createAudit(data: CreateAuditData, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.authAudit.create({
      data: {
        userId: data.userId,
        email: data.email,
        action: data.action,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        metadata: data.metadata as object,
      },
    });
  }
}
