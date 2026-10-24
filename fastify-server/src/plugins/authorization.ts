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
    'users:update',
    'users:manage_status',
    'users:delete',
    'stores:read',
    'stores:create',
    'stores:update',
    'stores:manage',
    'stores:manage_status',
    'store_members:read',
    'store_members:create',
    'store_members:update',
    'store_members:remove',
    'categories:read',
    'categories:create',
    'categories:update',
    'categories:manage_status',
    'categories:delete',
    'products:read',
    'products:create',
    'products:update',
    'products:manage',
    'products:manage_status',
    'product_variants:manage',
    'product_prices:manage',
    'inventory:read',
    'inventory:manage',
    'inventory:receive',
    'inventory:adjust',
    'inventory:read_movements',
    'inventory:manage_reservations',
    'inventory_transfers:read',
    'inventory_transfers:create',
    'inventory_transfers:approve',
    'inventory_transfers:ship',
    'inventory_transfers:receive',
    'inventory_transfers:cancel',
    'procurement:read',
    'procurement:manage',
    'suppliers:read',
    'suppliers:create',
    'suppliers:update',
    'suppliers:delete',
    'purchase_orders:read',
    'purchase_orders:create',
    'purchase_orders:update',
    'purchase_orders:approve',
    'purchase_orders:cancel',
    'goods_receipts:read',
    'goods_receipts:create',
    'sales:read',
    'sales:create',
    'sales:checkout',
    'sales:cancel',
    'sales:refund',
    'payments:read',
    'payments:record_cash',
    'payments:initiate',
    'payments:capture',
    'payments:void',
    'payments:refund',
    'receipts:read',
    'reports:read',
    'reports:export',
    'sessions:revoke_any',
  ],

  ADMIN: [
    'users:read',
    'users:manage',
    'users:update',
    'users:manage_status',
    'stores:read',
    'stores:create',
    'stores:update',
    'stores:manage',
    'stores:manage_status',
    'store_members:read',
    'store_members:create',
    'store_members:update',
    'store_members:remove',
    'categories:read',
    'categories:create',
    'categories:update',
    'categories:manage_status',
    'categories:delete',
    'products:read',
    'products:create',
    'products:update',
    'products:manage',
    'products:manage_status',
    'product_variants:manage',
    'product_prices:manage',
    'inventory:read',
    'inventory:manage',
    'inventory:receive',
    'inventory:adjust',
    'inventory:read_movements',
    'inventory:manage_reservations',
    'inventory_transfers:read',
    'inventory_transfers:create',
    'inventory_transfers:approve',
    'inventory_transfers:ship',
    'inventory_transfers:receive',
    'inventory_transfers:cancel',
    'procurement:read',
    'procurement:manage',
    'suppliers:read',
    'suppliers:create',
    'suppliers:update',
    'suppliers:delete',
    'purchase_orders:read',
    'purchase_orders:create',
    'purchase_orders:update',
    'purchase_orders:approve',
    'purchase_orders:cancel',
    'goods_receipts:read',
    'goods_receipts:create',
    'sales:read',
    'sales:create',
    'sales:checkout',
    'sales:cancel',
    'sales:refund',
    'payments:read',
    'payments:record_cash',
    'payments:initiate',
    'payments:capture',
    'payments:void',
    'payments:refund',
    'receipts:read',
    'reports:read',
    'reports:export',
    'sessions:revoke_any',
  ],

  STORE_MANAGER: [
    'stores:read',
    'store_members:read',
    'categories:read',
    'products:read',
    'products:create',
    'products:update',
    'product_variants:manage',
    'inventory:read',
    'inventory:manage',
    'inventory:receive',
    'inventory:adjust',
    'inventory:read_movements',
    'inventory:manage_reservations',
    'inventory_transfers:read',
    'inventory_transfers:create',
    'inventory_transfers:approve',
    'inventory_transfers:ship',
    'inventory_transfers:receive',
    'inventory_transfers:cancel',
    'procurement:read',
    'procurement:manage',
    'suppliers:read',
    'suppliers:create',
    'suppliers:update',
    'purchase_orders:read',
    'purchase_orders:create',
    'purchase_orders:update',
    'purchase_orders:approve',
    'purchase_orders:cancel',
    'goods_receipts:read',
    'goods_receipts:create',
    'sales:read',
    'sales:create',
    'sales:checkout',
    'sales:cancel',
    'sales:refund',
    'payments:read',
    'payments:record_cash',
    'payments:initiate',
    'payments:capture',
    'payments:void',
    'payments:refund',
    'receipts:read',
    'reports:read',
    'reports:export',
  ],

  INVENTORY_MANAGER: [
    'categories:read',
    'products:read',
    'products:create',
    'products:update',
    'product_variants:manage',
    'inventory:read',
    'inventory:manage',
    'inventory:receive',
    'inventory:adjust',
    'inventory:read_movements',
    'inventory:manage_reservations',
    'inventory_transfers:read',
    'inventory_transfers:create',
    'inventory_transfers:ship',
    'inventory_transfers:receive',
    'procurement:read',
    'suppliers:read',
    'purchase_orders:read',
    'purchase_orders:create',
    'goods_receipts:read',
    'goods_receipts:create',
    'reports:read',
  ],

  CASHIER: [
    'categories:read',
    'products:read',
    'inventory:read',
    'sales:read',
    'sales:create',
    'sales:checkout',
    'sales:cancel',
    'payments:read',
    'payments:record_cash',
    'payments:initiate',
    'receipts:read',
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

/**
 * Pre-handler hook enforcing multi-store access control:
 * 1. Global SUPER_ADMIN and ADMIN have access across all stores.
 * 2. Store-level staff must have an ACTIVE StoreMembership for the specified storeId
 *    whose assigned role grants the required permission, AND the store must exist and be ACTIVE.
 */
export function requireStoreAccess(
  permission: Permission,
  getStoreId: (request: FastifyRequest) => string | undefined = req => (req.params as Record<string, string>)['storeId']
): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required to access this resource.');
    }

    // 1. Global administrators bypass store-level membership checks
    const isGlobalAdmin = request.user.roles.includes('SUPER_ADMIN') || request.user.roles.includes('ADMIN');
    if (isGlobalAdmin) {
      if (request.user.permissions.includes(permission)) {
        return;
      }
      throw new ForbiddenError(`Access denied: Missing required permission '${permission}'.`);
    }

    // 2. Resolve target storeId
    const storeId = getStoreId(request);
    if (!storeId) {
      throw new ForbiddenError('Store identifier is required for this operation.');
    }

    // 3. Query Prisma for active store membership
    const membership = await request.server.prisma.storeMembership.findFirst({
      where: {
        userId: request.user.id,
        storeId,
      },
      include: {
        store: {
          select: {
            id: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenError('Access denied: You do not have an active membership for this store.');
    }

    if (membership.store.status !== 'ACTIVE' || membership.store.deletedAt !== null) {
      throw new ForbiddenError('Access denied: Target store is inactive, suspended, or deleted.');
    }

    // Check if membership role grants the required permission
    const memberPermissions = ROLE_PERMISSIONS[membership.role] || [];
    if (!memberPermissions.includes(permission)) {
      throw new ForbiddenError(
        `Access denied: Your store role '${membership.role}' does not grant permission '${permission}'.`
      );
    }
  };
}

/**
 * Pre-handler hook enforcing access to one or both stores involved in a stock transfer.
 * Global admins have full access across all stores.
 */
export function requireTransferStoreAccess(
  permission: Permission,
  storeResolver: (request: FastifyRequest) => { sourceStoreId?: string; destinationStoreId?: string; targetStoreId?: string }
): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.user) {
      throw new UnauthorizedError('Authentication required to access this resource.');
    }

    const isGlobalAdmin = request.user.roles.includes('SUPER_ADMIN') || request.user.roles.includes('ADMIN');
    if (isGlobalAdmin) {
      if (request.user.permissions.includes(permission)) {
        return;
      }
      throw new ForbiddenError(`Access denied: Missing required permission '${permission}'.`);
    }

    const stores = storeResolver(request);
    const storeIdToCheck = stores.targetStoreId || stores.sourceStoreId || stores.destinationStoreId;
    if (!storeIdToCheck) {
      throw new ForbiddenError('Store identifier could not be resolved for this transfer operation.');
    }

    const membership = await request.server.prisma.storeMembership.findFirst({
      where: {
        userId: request.user.id,
        storeId: storeIdToCheck,
      },
      include: {
        store: {
          select: {
            id: true,
            status: true,
            deletedAt: true,
          },
        },
      },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      throw new ForbiddenError('Access denied: You do not have an active membership for the store involved in this transfer.');
    }

    if (membership.store.status !== 'ACTIVE' || membership.store.deletedAt !== null) {
      throw new ForbiddenError('Access denied: Store involved in this transfer is inactive, suspended, or deleted.');
    }

    const memberPermissions = ROLE_PERMISSIONS[membership.role] || [];
    if (!memberPermissions.includes(permission)) {
      throw new ForbiddenError(
        `Access denied: Your store role '${membership.role}' does not grant permission '${permission}'.`
      );
    }
  };
}


