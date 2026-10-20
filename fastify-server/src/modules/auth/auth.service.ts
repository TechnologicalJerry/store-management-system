import type { PrismaClient } from '@prisma/client';
import type { AuthRepository } from './auth.repository.js';
import { passwordService, type PasswordService } from './password.service.js';
import { tokenService, type TokenService } from './token.service.js';
import type { SessionService } from './session.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../common/errors/app-error.js';
import { getPermissionsForRoles } from '../../plugins/authorization.js';
import type {
  AuthTokens,
  RequestMetadata,
  Role,
  UserProfileResponse,
} from './auth.types.js';

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly authRepository: AuthRepository,
    private readonly sessionService: SessionService,
    private readonly passwordSvc: PasswordService = passwordService,
    private readonly tokenSvc: TokenService = tokenService
  ) {}

  /**
   * Registers a new user account with default CASHIER role.
   */
  public async register(
    input: RegisterInput,
    meta?: RequestMetadata
  ): Promise<{ user: UserProfileResponse }> {
    const normalizedEmail = this.passwordSvc.normalizeEmail(input.email);
    this.passwordSvc.assertValidPassword(input.password);

    // Check if email already registered
    const existing = await this.authRepository.findByEmail(normalizedEmail);
    if (existing) {
      throw new ConflictError('An account with this email address already exists.');
    }

    const passwordHash = await this.passwordSvc.hashPassword(input.password);

    // Create user in database with default role
    const defaultRoles: Role[] = ['CASHIER'];
    const user = await this.authRepository.createUser({
      email: normalizedEmail,
      passwordHash,
      name: input.name.trim(),
      roles: defaultRoles,
    });

    await this.authRepository.createAudit({
      userId: user.id,
      email: user.email,
      action: 'REGISTER_SUCCESS',
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
        roles: defaultRoles,
        permissions: getPermissionsForRoles(defaultRoles),
        lastLoginAt: null,
        createdAt: user.createdAt.toISOString(),
      },
    };
  }

  /**
   * Authenticates user credentials, enforces session limits, and issues access & refresh tokens.
   */
  public async login(
    input: LoginInput,
    meta?: RequestMetadata
  ): Promise<{ user: UserProfileResponse; tokens: AuthTokens; sessionId: string }> {
    const normalizedEmail = this.passwordSvc.normalizeEmail(input.email);

    // Constant-time mitigation against timing enumeration attacks
    const user = await this.authRepository.findByEmail(normalizedEmail);
    if (!user) {
      // Execute dummy argon2 hash verification to match timing
      await this.passwordSvc.verifyPassword(
        '$argon2id$v=19$m=65536,t=3,p=4$dummyhashdummyhashdummyhash$dummyhashdummyhashdummyhash',
        input.password
      );

      await this.authRepository.createAudit({
        email: normalizedEmail,
        action: 'LOGIN_FAILED',
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        metadata: { reason: 'USER_NOT_FOUND' },
      });

      throw new UnauthorizedError('Invalid email or password.');
    }

    // Verify account status
    if (user.status === 'SUSPENDED') {
      throw new ForbiddenError(
        'Your account has been suspended. Please contact system administration.'
      );
    }
    if (user.status === 'DEACTIVATED') {
      throw new ForbiddenError('Your account has been deactivated.');
    }

    // Verify password hash
    const isValidPassword = await this.passwordSvc.verifyPassword(user.passwordHash, input.password);
    if (!isValidPassword) {
      await this.authRepository.createAudit({
        userId: user.id,
        email: user.email,
        action: 'LOGIN_FAILED',
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        metadata: { reason: 'INVALID_PASSWORD' },
      });

      throw new UnauthorizedError('Invalid email or password.');
    }

    // Create session and enforce FIFO max active session limits
    const { session, tokens } = await this.sessionService.createSession(user.id, meta);

    // Update last login timestamp
    await this.authRepository.updateLastLogin(user.id);

    // Record login audit
    await this.authRepository.createAudit({
      userId: user.id,
      email: user.email,
      action: 'LOGIN_SUCCESS',
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent,
      metadata: { sessionId: session.id },
    });

    const userRoles = user.roles.map(r => r.role);

    // Issue JWT access token
    const accessToken = this.tokenSvc.signAccessToken({
      sub: user.id,
      email: user.email,
      name: user.name,
      roles: userRoles,
      sessionId: session.id,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        status: user.status,
        roles: userRoles,
        permissions: getPermissionsForRoles(userRoles),
        lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
        createdAt: user.createdAt.toISOString(),
      },
      tokens: {
        accessToken,
        refreshToken: tokens.rawRefreshToken,
        expiresInSeconds: 900,
      },
      sessionId: session.id,
    };
  }

  /**
   * Refreshes access token and rotates refresh token.
   */
  public async refresh(
    rawRefreshToken: string,
    meta?: RequestMetadata
  ): Promise<{ tokens: AuthTokens }> {
    const { authTokens } = await this.sessionService.rotateRefreshToken(rawRefreshToken, meta);
    return { tokens: authTokens };
  }

  /**
   * Logs out current session.
   */
  public async logout(sessionId: string, meta?: RequestMetadata): Promise<void> {
    const session = await this.authRepository.findSessionById(sessionId);
    if (session) {
      await this.sessionService.revokeSession(sessionId);
      await this.authRepository.createAudit({
        userId: session.userId,
        email: 'session-revocation',
        action: 'LOGOUT',
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
        metadata: { sessionId },
      });
    }
  }

  /**
   * Logs out all active sessions for a user.
   */
  public async logoutAll(userId: string, meta?: RequestMetadata): Promise<void> {
    const user = await this.authRepository.findById(userId);
    if (user) {
      await this.sessionService.revokeAllUserSessions(userId);
      await this.authRepository.createAudit({
        userId,
        email: user.email,
        action: 'LOGOUT_ALL',
        ipAddress: meta?.ipAddress,
        userAgent: meta?.userAgent,
      });
    }
  }

  /**
   * Retrieves authenticated user profile and permissions.
   */
  public async getMe(userId: string): Promise<UserProfileResponse> {
    const user = await this.authRepository.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedError('User account not found or inactive.');
    }

    const userRoles = user.roles.map(r => r.role);
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status,
      roles: userRoles,
      permissions: getPermissionsForRoles(userRoles),
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
    };
  }

  /**
   * Lists active and recent sessions for a user.
   */
  public async getUserSessions(userId: string, currentSessionId?: string) {
    return this.sessionService.listUserSessions(userId, currentSessionId);
  }

  /**
   * Revokes a session, ensuring ownership or administrative authorization.
   */
  public async revokeSession(
    currentUserId: string,
    sessionId: string,
    userRoles: Role[]
  ): Promise<void> {
    const session = await this.authRepository.findSessionById(sessionId);
    if (!session) {
      throw new NotFoundError('Session not found.');
    }

    const isOwner = session.userId === currentUserId;
    const isAdmin = userRoles.includes('ADMIN') || userRoles.includes('SUPER_ADMIN');

    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('You are not authorized to revoke another user session.');
    }

    await this.sessionService.revokeSession(sessionId);
  }
}
