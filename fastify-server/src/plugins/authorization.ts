import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { Permission, Role } from '../modules/auth/auth.types.js';
import { ForbiddenError, UnauthorizedError } from '../common/errors/app-error.js';

/**
 * Canonical Role-to-Permissions mapping defining default authorization privileges.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  SUPER_ADMIN: [
    'users:read',
    'users:manage',
    'users:delete',
    'stores:read',
    'stores:manage',
    'products:read',
    'products:manage',
    'inventory:read',
    'inventory:manage',
    'inventory:adjust',
    'procurement:read',
    'procurement:manage',
    'sales:read',
    'sales:create',
    'sales:refund',
    'reports:read',
    'reports:export',
    'sessions:revoke_any',
  ],

  ADMIN: [
    'users:read',
    'users:manage',
    'stores:read',
    'stores:manage',
    'products:read',
    'products:manage',
    'inventory:read',
    'inventory:manage',
    'inventory:adjust',
    'procurement:read',
    'procurement:manage',
    'sales:read',
    'sales:create',
    'sales:refund',
    'reports:read',
    'reports:export',
    'sessions:revoke_any',
  ],

  STORE_MANAGER: [
    'stores:read',
    'products:read',
    'products:manage',
    'inventory:read',
    'inventory:manage',
    'inventory:adjust',
    'procurement:read',
    'procurement:manage',
    'sales:read',
    'sales:create',
    'sales:refund',
    'reports:read',
    'reports:export',
  ],

  INVENTORY_MANAGER: [
    'products:read',
    'inventory:read',
    'inventory:manage',
    'inventory:adjust',
    'procurement:read',
    'procurement:manage',
    'reports:read',
  ],

  CASHIER: [
    'products:read',
    'inventory:read',
    'sales:read',
    'sales:create',
  ],
};

/**
 * Computes the union of all permissions granted across a user's assigned roles.
 */
export function getPermissionsForRoles(roles: Role[]): Permission[] {
  const permissionsSet = new Set<Permission>();
  for (const role of roles) {
    const permissions = ROLE_PERMISSIONS[role];
    if (permissions) {
      for (const p of permissions) {
        permissionsSet.add(p);
      }
    }
  }
  return Array.from(permissionsSet);
}

/**
 * Checks if a user has all required permissions.
 */
export function hasAllPermissions(
  userPermissions: Permission[],
  requiredPermissions: Permission[]
): boolean {
  const userSet = new Set(userPermissions);
  return requiredPermissions.every(perm => userSet.has(perm));
}

/**
 * Checks if a user has at least one of the specified permissions.
 */
export function hasAnyPermission(
  userPermissions: Permission[],
  requiredPermissions: Permission[]
): boolean {
  const userSet = new Set(userPermissions);
  return requiredPermissions.some(perm => userSet.has(perm));
}

/**
 * Pre-handler hook enforcing that an authenticated user possesses at least one of the specified roles.
 */
export function requireRoles(...roles: Role[]): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required to access this resource.');
    }

    const hasMatchingRole = request.user.roles.some(userRole => roles.includes(userRole));
    if (!hasMatchingRole) {
      throw new ForbiddenError(
        'Access denied: You do not possess the required role for this operation.'
      );
    }
  };
}

/**
 * Pre-handler hook enforcing that an authenticated user possesses all specified permissions.
 */
export function requirePermissions(...permissions: Permission[]): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required to access this resource.');
    }

    if (!hasAllPermissions(request.user.permissions, permissions)) {
      throw new ForbiddenError(
        'Access denied: You do not possess the required permissions for this operation.'
      );
    }
  };
}
