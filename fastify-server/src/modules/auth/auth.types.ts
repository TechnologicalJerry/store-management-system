/**
 * System authorization roles.
 */
export type Role =
  | 'SUPER_ADMIN'
  | 'ADMIN'
  | 'STORE_MANAGER'
  | 'INVENTORY_MANAGER'
  | 'CASHIER';

/**
 * System permissions for granular access control.
 */
export type Permission =
  // User Management
  | 'users:read'
  | 'users:manage'
  | 'users:delete'
  // Store Management
  | 'stores:read'
  | 'stores:manage'
  // Product Catalog
  | 'products:read'
  | 'products:manage'
  // Inventory Operations
  | 'inventory:read'
  | 'inventory:manage'
  | 'inventory:adjust'
  // Procurement & Suppliers
  | 'procurement:read'
  | 'procurement:manage'
  // Sales & Point-of-Sale
  | 'sales:read'
  | 'sales:create'
  | 'sales:refund'
  // Reporting & Analytics
  | 'reports:read'
  | 'reports:export'
  // Session Security
  | 'sessions:revoke_any';

/**
 * User account lifecycle status.
 */
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

/**
 * Session lifecycle status.
 */
export type SessionStatus = 'ACTIVE' | 'REVOKED' | 'EXPIRED';

/**
 * Security audit event actions.
 */
export type AuthAuditAction =
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'LOGOUT_ALL'
  | 'TOKEN_REFRESH'
  | 'TOKEN_REUSE_DETECTED'
  | 'SESSION_REVOKED'
  | 'ACCOUNT_SUSPENDED'
  | 'REGISTER_SUCCESS';

/**
 * Clean domain representation of an authenticated user.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  roles: Role[];
  permissions: Permission[];
  sessionId: string;
}

/**
 * Sanitized user response representation (never includes password hash).
 */
export interface UserProfileResponse {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  roles: Role[];
  permissions: Permission[];
  lastLoginAt: string | null;
  createdAt: string;
}

/**
 * JWT Access Token claims payload.
 */
export interface AccessTokenClaims {
  sub: string; // User ID
  email: string;
  name: string;
  roles: Role[];
  sessionId: string;
  iss?: string;
  aud?: string;
  iat?: number;
  exp?: number;
}

/**
 * Session view returned to clients (never includes token hashes).
 */
export interface SessionView {
  id: string;
  tokenFamily: string;
  status: SessionStatus;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  isCurrent?: boolean;
}

/**
 * Token pair returned upon login or token rotation.
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

/**
 * Request metadata captured for audit and session tracking.
 */
export interface RequestMetadata {
  ipAddress?: string;
  userAgent?: string;
}
