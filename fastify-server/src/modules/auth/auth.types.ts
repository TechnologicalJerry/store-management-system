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
  // User Administration
  | 'users:read'
  | 'users:manage'
  | 'users:update'
  | 'users:manage_status'
  | 'users:delete'
  // Store Management
  | 'stores:read'
  | 'stores:create'
  | 'stores:update'
  | 'stores:manage'
  | 'stores:manage_status'
  // Store Memberships
  | 'store_members:read'
  | 'store_members:create'
  | 'store_members:update'
  | 'store_members:remove'
  // Product Categories
  | 'categories:read'
  | 'categories:create'
  | 'categories:update'
  | 'categories:manage_status'
  | 'categories:delete'
  // Product Catalog & Variants
  | 'products:read'
  | 'products:create'
  | 'products:update'
  | 'products:manage'
  | 'products:manage_status'
  | 'product_variants:manage'
  | 'product_prices:manage'
  // Inventory Operations
  | 'inventory:read'
  | 'inventory:manage'
  | 'inventory:receive'
  | 'inventory:adjust'
  | 'inventory:read_movements'
  | 'inventory:manage_reservations'
  // Inter-Store Inventory Transfers
  | 'inventory_transfers:read'
  | 'inventory_transfers:create'
  | 'inventory_transfers:approve'
  | 'inventory_transfers:ship'
  | 'inventory_transfers:receive'
  | 'inventory_transfers:cancel'
  // Procurement & Suppliers
  | 'procurement:read'
  | 'procurement:manage'
  | 'suppliers:read'
  | 'suppliers:create'
  | 'suppliers:update'
  | 'suppliers:delete'
  | 'purchase_orders:read'
  | 'purchase_orders:create'
  | 'purchase_orders:update'
  | 'purchase_orders:approve'
  | 'purchase_orders:cancel'
  | 'goods_receipts:read'
  | 'goods_receipts:create'
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
