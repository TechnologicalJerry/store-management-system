import { describe, expect, it, vi } from 'vitest';
import { requireStoreAccess, requirePermissions, requireRoles } from '../../src/plugins/authorization.js';
import { ForbiddenError, UnauthorizedError } from '../../src/common/errors/app-error.js';
import { TEST_IDS, createMockUser } from '../helpers/test-fixtures.js';
import { tokenService } from '../../src/modules/auth/token.service.js';
import { loadEnv } from '../../src/config/env.js';

describe('Security Regression & Authorization Guardrails (Unit)', () => {
  loadEnv();

  describe('Insecure Direct Object Reference (IDOR) & Store Isolation', () => {
    it('denies access when a cashier belonging to Store A attempts an operation on Store B', async () => {
      const cashierUser = createMockUser({
        id: TEST_IDS.CASHIER,
        roles: ['CASHIER'],
        permissions: ['sales:read', 'inventory:read'],
      });

      const mockRequest: any = {
        user: cashierUser,
        params: { storeId: TEST_IDS.STORE_B },
        server: {
          prisma: {
            storeMembership: {
              // Cashier has active membership ONLY in Store A, none in Store B
              findFirst: vi.fn().mockResolvedValue(null),
            },
          },
        },
      };

      const guard = requireStoreAccess('sales:read', req => req.params.storeId);
      await expect(guard(mockRequest, {} as any)).rejects.toThrow(ForbiddenError);
    });

    it('allows global SUPER_ADMIN to bypass store-specific membership checks', async () => {
      const superAdminUser = createMockUser({
        id: TEST_IDS.SUPER_ADMIN,
        roles: ['SUPER_ADMIN'],
        permissions: ['sales:read', 'reports:read', 'stores:read'],
      });

      const mockRequest: any = {
        user: superAdminUser,
        params: { storeId: TEST_IDS.STORE_B },
        server: {
          prisma: {
            storeMembership: {
              findFirst: vi.fn(),
            },
          },
        },
      };

      const guard = requireStoreAccess('sales:read', req => req.params.storeId);
      // Should resolve without error and without querying storeMembership
      await expect(guard(mockRequest, {} as any)).resolves.toBeUndefined();
      expect(mockRequest.server.prisma.storeMembership.findFirst).not.toHaveBeenCalled();
    });
  });

  describe('Privilege Escalation Prevention', () => {
    it('denies Cashier role from executing purchase order approvals', async () => {
      const cashierUser = createMockUser({
        id: TEST_IDS.CASHIER,
        roles: ['CASHIER'],
        permissions: ['sales:create', 'sales:read', 'payments:record_cash'],
      });

      const mockRequest: any = { user: cashierUser };
      const guard = requirePermissions('purchase_orders:approve');

      await expect(guard(mockRequest, {} as any)).rejects.toThrow(ForbiddenError);
    });

    it('denies Inventory Manager role from managing global system users', async () => {
      const invManagerUser = createMockUser({
        id: TEST_IDS.STORE_MANAGER,
        roles: ['INVENTORY_MANAGER'],
        permissions: ['inventory:read', 'inventory:adjust'],
      });

      const mockRequest: any = { user: invManagerUser };
      const guard = requireRoles('SUPER_ADMIN', 'ADMIN');

      await expect(guard(mockRequest, {} as any)).rejects.toThrow(ForbiddenError);
    });
  });

  describe('JWT Signature & Expiration Security', () => {
    it('rejects tampered or forged JWT access tokens', () => {
      const validToken = tokenService.generateAccessToken({
        id: TEST_IDS.CASHIER,
        email: 'cashier@store.local',
        roles: ['CASHIER'],
        sessionId: TEST_IDS.SESSION_1,
        tokenVersion: 1,
      });

      // Tamper signature by changing final characters
      const tamperedToken = validToken.slice(0, -6) + 'xxxxxx';

      expect(() => tokenService.verifyAccessToken(tamperedToken)).toThrow();
    });

    it('rejects expired JWT access tokens with ExpiredTokenError', () => {
      const expiredToken = tokenService.generateAccessToken(
        {
          id: TEST_IDS.CASHIER,
          email: 'cashier@store.local',
          roles: ['CASHIER'],
          sessionId: TEST_IDS.SESSION_1,
          tokenVersion: 1,
        },
        '-1s' // Expired 1 second ago
      );

      expect(() => tokenService.verifyAccessToken(expiredToken)).toThrow();
    });
  });

  describe('Unauthenticated Request Rejection', () => {
    it('rejects unauthenticated requests lacking a user context with UnauthorizedError', async () => {
      const mockRequest: any = { user: undefined };
      const guard = requirePermissions('sales:read');

      await expect(guard(mockRequest, {} as any)).rejects.toThrow(UnauthorizedError);
    });
  });
});
