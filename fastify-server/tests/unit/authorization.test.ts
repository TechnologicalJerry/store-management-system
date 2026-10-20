import { describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  ROLE_PERMISSIONS,
  getPermissionsForRoles,
  requirePermissions,
  requireRoles,
} from '../../src/plugins/authorization.js';
import { ForbiddenError, UnauthorizedError } from '../../src/common/errors/app-error.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';

describe('Authorization & Permissions (Unit)', () => {
  describe('ROLE_PERMISSIONS mappings', () => {
    it('SUPER_ADMIN should possess all defined system permissions', () => {
      const superAdminPerms = ROLE_PERMISSIONS['SUPER_ADMIN'];
      expect(superAdminPerms).toContain('users:manage');
      expect(superAdminPerms).toContain('stores:manage');
      expect(superAdminPerms).toContain('products:manage');
      expect(superAdminPerms).toContain('inventory:manage');
      expect(superAdminPerms).toContain('reports:read');
    });

    it('CASHIER should have bounded operational permissions', () => {
      const cashierPerms = ROLE_PERMISSIONS['CASHIER'];
      expect(cashierPerms).toContain('sales:create');
      expect(cashierPerms).toContain('products:read');
      expect(cashierPerms).not.toContain('users:manage');
      expect(cashierPerms).not.toContain('reports:read');
    });
  });

  describe('getPermissionsForRoles', () => {
    it('should aggregate and deduplicate permissions across multiple roles', () => {
      const perms = getPermissionsForRoles(['CASHIER', 'INVENTORY_MANAGER']);
      expect(perms).toContain('sales:create');
      expect(perms).toContain('inventory:read');
      expect(perms).toContain('inventory:adjust');

      // Deduplication verification
      const uniquePerms = Array.from(new Set(perms));
      expect(perms.length).toBe(uniquePerms.length);
    });

    it('should return an empty array when no roles are provided', () => {
      const perms = getPermissionsForRoles([]);
      expect(perms).toEqual([]);
    });
  });

  describe('requireRoles pre-handler', () => {
    const dummyReply = {} as FastifyReply;

    it('should allow access when the user has one of the required roles', async () => {
      const handler = requireRoles(['ADMIN', 'SUPER_ADMIN']);
      const req = {
        user: {
          id: '123',
          roles: ['ADMIN'],
        } as AuthenticatedUser,
      } as FastifyRequest;

      await expect(handler(req, dummyReply)).resolves.toBeUndefined();
    });

    it('should throw UnauthorizedError when user is not authenticated', async () => {
      const handler = requireRoles(['ADMIN']);
      const req = {} as FastifyRequest;

      await expect(handler(req, dummyReply)).rejects.toThrow(UnauthorizedError);
    });

    it('should throw ForbiddenError when user has insufficient roles', async () => {
      const handler = requireRoles(['ADMIN', 'SUPER_ADMIN']);
      const req = {
        user: {
          id: '123',
          roles: ['CASHIER'],
        } as AuthenticatedUser,
      } as FastifyRequest;

      await expect(handler(req, dummyReply)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('requirePermissions pre-handler', () => {
    const dummyReply = {} as FastifyReply;

    it('should allow access when the user holds all required permissions', async () => {
      const handler = requirePermissions(['inventory:read', 'inventory:adjust']);
      const req = {
        user: {
          id: '123',
          permissions: ['inventory:read', 'inventory:adjust', 'products:read'],
        } as AuthenticatedUser,
      } as FastifyRequest;

      await expect(handler(req, dummyReply)).resolves.toBeUndefined();
    });

    it('should throw ForbiddenError when user is missing any required permission', async () => {
      const handler = requirePermissions(['users:manage']);
      const req = {
        user: {
          id: '123',
          permissions: ['sales:create', 'products:read'],
        } as AuthenticatedUser,
      } as FastifyRequest;

      await expect(handler(req, dummyReply)).rejects.toThrow(ForbiddenError);
    });
  });
});
