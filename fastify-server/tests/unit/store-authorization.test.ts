import { describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { requireStoreAccess } from '../../src/plugins/authorization.js';
import { ForbiddenError, UnauthorizedError } from '../../src/common/errors/app-error.js';
import type { AuthenticatedUser } from '../../src/modules/auth/auth.types.js';

describe('Store-Scoped Authorization (Unit)', () => {
  const dummyReply = {} as FastifyReply;
  const storeId = 'store-uuid-1';

  it('should grant access immediately to global SUPER_ADMIN and ADMIN', async () => {
    const handler = requireStoreAccess('store_members:read');
    const req = {
      user: {
        id: 'admin-id',
        roles: ['SUPER_ADMIN'],
        permissions: ['store_members:read'],
      } as AuthenticatedUser,
      params: { storeId },
    } as unknown as FastifyRequest;

    await expect(handler(req, dummyReply)).resolves.toBeUndefined();
  });

  it('should reject unauthenticated request with UnauthorizedError', async () => {
    const handler = requireStoreAccess('store_members:read');
    const req = {
      params: { storeId },
    } as unknown as FastifyRequest;

    await expect(handler(req, dummyReply)).rejects.toThrow(UnauthorizedError);
  });

  it('should grant access to store staff when active membership grants permission', async () => {
    const handler = requireStoreAccess('store_members:read');
    const req = {
      user: {
        id: 'manager-id',
        roles: ['STORE_MANAGER'],
        permissions: [],
      } as AuthenticatedUser,
      params: { storeId },
      server: {
        prisma: {
          storeMembership: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'membership-1',
              userId: 'manager-id',
              storeId,
              role: 'STORE_MANAGER',
              status: 'ACTIVE',
              store: {
                id: storeId,
                status: 'ACTIVE',
                deletedAt: null,
              },
            }),
          },
        },
      },
    } as unknown as FastifyRequest;

    await expect(handler(req, dummyReply)).resolves.toBeUndefined();
  });

  it('should throw ForbiddenError when user has no membership in target store', async () => {
    const handler = requireStoreAccess('store_members:read');
    const req = {
      user: {
        id: 'cashier-id',
        roles: ['CASHIER'],
        permissions: [],
      } as AuthenticatedUser,
      params: { storeId },
      server: {
        prisma: {
          storeMembership: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
      },
    } as unknown as FastifyRequest;

    await expect(handler(req, dummyReply)).rejects.toThrow(ForbiddenError);
  });

  it('should throw ForbiddenError when target store is INACTIVE or SUSPENDED', async () => {
    const handler = requireStoreAccess('store_members:read');
    const req = {
      user: {
        id: 'manager-id',
        roles: ['STORE_MANAGER'],
        permissions: [],
      } as AuthenticatedUser,
      params: { storeId },
      server: {
        prisma: {
          storeMembership: {
            findFirst: vi.fn().mockResolvedValue({
              id: 'membership-1',
              userId: 'manager-id',
              storeId,
              role: 'STORE_MANAGER',
              status: 'ACTIVE',
              store: {
                id: storeId,
                status: 'INACTIVE',
                deletedAt: null,
              },
            }),
          },
        },
      },
    } as unknown as FastifyRequest;

    await expect(handler(req, dummyReply)).rejects.toThrow(/Target store is inactive/);
  });
});
