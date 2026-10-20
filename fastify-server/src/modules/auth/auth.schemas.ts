import type { FastifySchema } from 'fastify';

const userProfileSchema = {
  type: 'object',
  required: ['id', 'email', 'name', 'status', 'roles', 'permissions', 'createdAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', format: 'email' },
    name: { type: 'string' },
    status: { type: 'string', enum: ['ACTIVE', 'SUSPENDED', 'DEACTIVATED'] },
    roles: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['SUPER_ADMIN', 'ADMIN', 'STORE_MANAGER', 'INVENTORY_MANAGER', 'CASHIER'],
      },
    },
    permissions: {
      type: 'array',
      items: { type: 'string' },
    },
    lastLoginAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const authTokensSchema = {
  type: 'object',
  required: ['accessToken', 'expiresInSeconds'],
  properties: {
    accessToken: { type: 'string' },
    refreshToken: { type: 'string', nullable: true },
    expiresInSeconds: { type: 'integer', example: 900 },
  },
};

export const registerSchema: FastifySchema = {
  tags: ['Authentication'],
  summary: 'Register a new user account',
  description: 'Creates a standard user account with default CASHIER role. Public clients cannot assign privileged roles.',
  body: {
    type: 'object',
    required: ['email', 'password', 'name'],
    properties: {
      email: { type: 'string', format: 'email', minLength: 5, maxLength: 255 },
      password: { type: 'string', minLength: 8, maxLength: 128 },
      name: { type: 'string', minLength: 1, maxLength: 100 },
    },
  },
  response: {
    201: {
      description: 'Account successfully registered.',
      type: 'object',
      required: ['statusCode', 'user'],
      properties: {
        statusCode: { type: 'integer', example: 201 },
        user: userProfileSchema,
      },
    },
  },
};

export const loginSchema: FastifySchema = {
  tags: ['Authentication'],
  summary: 'User login and token issuance',
  description: 'Authenticates user credentials, enforces active-session limits (FIFO eviction), and issues tokens.',
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 1 },
    },
  },
  response: {
    200: {
      description: 'Login successful. Returns access token and sets HttpOnly refresh cookie.',
      type: 'object',
      required: ['statusCode', 'user', 'tokens', 'sessionId'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        user: userProfileSchema,
        tokens: authTokensSchema,
        sessionId: { type: 'string', format: 'uuid' },
      },
    },
  },
};

export const refreshSchema: FastifySchema = {
  tags: ['Authentication'],
  summary: 'Rotate refresh token and issue new access token',
  description: 'Rotates refresh token and detects replay attacks. Reads refresh token from HttpOnly cookie or request body.',
  body: {
    type: 'object',
    properties: {
      refreshToken: { type: 'string' },
    },
  },
  response: {
    200: {
      description: 'Token successfully rotated.',
      type: 'object',
      required: ['statusCode', 'tokens'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        tokens: authTokensSchema,
      },
    },
  },
};

export const logoutSchema: FastifySchema = {
  tags: ['Authentication'],
  summary: 'Log out current session',
  description: 'Revokes the active session and clears the refresh token cookie.',
  response: {
    200: {
      description: 'Session successfully revoked.',
      type: 'object',
      required: ['statusCode', 'success', 'message'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Logged out successfully.' },
      },
    },
  },
};

export const logoutAllSchema: FastifySchema = {
  tags: ['Authentication'],
  summary: 'Log out all active sessions for current user',
  description: 'Revokes all active sessions belonging to the authenticated caller across all devices.',
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      description: 'All sessions successfully revoked.',
      type: 'object',
      required: ['statusCode', 'success', 'message'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'All active sessions revoked successfully.' },
      },
    },
  },
};

export const getMeSchema: FastifySchema = {
  tags: ['Authentication'],
  summary: 'Get current authenticated user profile',
  description: 'Returns profile, roles, and evaluated permissions of the authenticated caller.',
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      description: 'Authenticated user profile.',
      type: 'object',
      required: ['statusCode', 'user'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        user: userProfileSchema,
      },
    },
  },
};

export const getSessionsSchema: FastifySchema = {
  tags: ['Authentication'],
  summary: 'List user active and recent sessions',
  description: 'Returns active and recent sessions for the authenticated user without exposing secrets.',
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      description: 'List of user sessions.',
      type: 'object',
      required: ['statusCode', 'sessions'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        sessions: {
          type: 'array',
          items: {
            type: 'object',
            required: ['id', 'status', 'createdAt', 'lastUsedAt', 'expiresAt'],
            properties: {
              id: { type: 'string', format: 'uuid' },
              tokenFamily: { type: 'string', format: 'uuid' },
              status: { type: 'string', enum: ['ACTIVE', 'REVOKED', 'EXPIRED'] },
              ipAddress: { type: 'string', nullable: true },
              userAgent: { type: 'string', nullable: true },
              createdAt: { type: 'string', format: 'date-time' },
              lastUsedAt: { type: 'string', format: 'date-time' },
              expiresAt: { type: 'string', format: 'date-time' },
              isCurrent: { type: 'boolean', nullable: true },
            },
          },
        },
      },
    },
  },
};

export const revokeSessionSchema: FastifySchema = {
  tags: ['Authentication'],
  summary: 'Revoke a specific session',
  description: 'Revokes a session by ID. Users can revoke their own sessions; administrators can revoke any session.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['sessionId'],
    properties: {
      sessionId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'Session successfully revoked.',
      type: 'object',
      required: ['statusCode', 'success', 'message'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Session revoked successfully.' },
      },
    },
  },
};
