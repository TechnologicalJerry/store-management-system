import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserService } from '../../src/modules/users/user.service.js';
import type { UserRepository } from '../../src/modules/users/user.repository.js';
import type { StoreRepository } from '../../src/modules/stores/store.repository.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../src/common/errors/app-error.js';

describe('UserService (Unit)', () => {
  let mockUserRepo: UserRepository;
  let mockStoreRepo: StoreRepository;
  let userService: UserService;

  const mockDate = new Date('2026-10-21T10:00:00Z');
  const sampleUser = {
    id: 'user-uuid-1',
    email: 'admin@store.local',
    passwordHash: '$argon2id$hashedpassword',
    name: 'Admin User',
    status: 'ACTIVE' as const,
    emailVerifiedAt: mockDate,
    lastLoginAt: mockDate,
    createdAt: mockDate,
    updatedAt: mockDate,
    roles: [{ id: 'role-1', userId: 'user-uuid-1', role: 'SUPER_ADMIN' as const, createdAt: mockDate }],
  };

  const sampleStore = {
    id: 'store-uuid-1',
    name: 'Flagship Store',
    code: 'STORE-001',
    description: null,
    email: null,
    phone: null,
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    countryCode: null,
    timezone: 'UTC',
    status: 'ACTIVE' as const,
    createdAt: mockDate,
    updatedAt: mockDate,
    deletedAt: null,
  };

  const sampleMembership = {
    id: 'membership-uuid-1',
    userId: 'user-uuid-1',
    storeId: 'store-uuid-1',
    role: 'STORE_MANAGER' as const,
    status: 'ACTIVE' as const,
    createdByUserId: null,
    createdAt: mockDate,
    updatedAt: mockDate,
    user: {
      id: 'user-uuid-1',
      email: 'admin@store.local',
      name: 'Admin User',
      status: 'ACTIVE',
    },
    store: sampleStore,
  };

  beforeEach(() => {
    mockUserRepo = {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      countSuperAdmins: vi.fn(),
      updateUser: vi.fn(),
      findManyUsers: vi.fn(),
      countUsers: vi.fn(),
      findMembershipById: vi.fn(),
      findMembershipByUserAndStore: vi.fn(),
      createMembership: vi.fn(),
      updateMembership: vi.fn(),
      deleteMembership: vi.fn(),
      findStoreMembers: vi.fn(),
      countStoreMembers: vi.fn(),
    } as unknown as UserRepository;

    mockStoreRepo = {
      findById: vi.fn(),
    } as unknown as StoreRepository;

    userService = new UserService(mockUserRepo, mockStoreRepo);
  });

  describe('getUserById and formatting', () => {
    it('should return user without exposing passwordHash or secret fields', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValue(sampleUser as any);

      const result = await userService.getUserById(sampleUser.id);
      expect(result.id).toBe(sampleUser.id);
      expect(result.email).toBe(sampleUser.email);
      expect((result as any).passwordHash).toBeUndefined();
      expect(result.roles).toContain('SUPER_ADMIN');
    });
  });

  describe('updateUserStatus safeguard', () => {
    it('should throw BadRequestError when attempting to suspend the last active SUPER_ADMIN', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValue(sampleUser as any);
      vi.mocked(mockUserRepo.countSuperAdmins).mockResolvedValue(1); // Only 1 active super admin

      await expect(
        userService.updateUserStatus(sampleUser.id, { status: 'SUSPENDED' })
      ).rejects.toThrow(BadRequestError);
    });

    it('should allow suspending SUPER_ADMIN if more than one active SUPER_ADMIN exists', async () => {
      vi.mocked(mockUserRepo.findById).mockResolvedValue(sampleUser as any);
      vi.mocked(mockUserRepo.countSuperAdmins).mockResolvedValue(2);
      vi.mocked(mockUserRepo.updateUser).mockResolvedValue({
        ...sampleUser,
        status: 'SUSPENDED',
      } as any);

      const result = await userService.updateUserStatus(sampleUser.id, { status: 'SUSPENDED' });
      expect(result.status).toBe('SUSPENDED');
    });
  });

  describe('createStoreMember', () => {
    it('should create store membership when store and user are active', async () => {
      vi.mocked(mockStoreRepo.findById).mockResolvedValue(sampleStore as any);
      vi.mocked(mockUserRepo.findById).mockResolvedValue(sampleUser as any);
      vi.mocked(mockUserRepo.findMembershipByUserAndStore).mockResolvedValue(null);
      vi.mocked(mockUserRepo.createMembership).mockResolvedValue(sampleMembership as any);

      const result = await userService.createStoreMember(sampleStore.id, {
        userId: sampleUser.id,
        role: 'STORE_MANAGER',
      });

      expect(result.storeId).toBe(sampleStore.id);
      expect(result.userId).toBe(sampleUser.id);
      expect(result.role).toBe('STORE_MANAGER');
    });

    it('should throw ConflictError if user is already a member of the store', async () => {
      vi.mocked(mockStoreRepo.findById).mockResolvedValue(sampleStore as any);
      vi.mocked(mockUserRepo.findById).mockResolvedValue(sampleUser as any);
      vi.mocked(mockUserRepo.findMembershipByUserAndStore).mockResolvedValue(sampleMembership as any);

      await expect(
        userService.createStoreMember(sampleStore.id, {
          userId: sampleUser.id,
          role: 'CASHIER',
        })
      ).rejects.toThrow(ConflictError);
    });

    it('should throw BadRequestError if store is not active', async () => {
      vi.mocked(mockStoreRepo.findById).mockResolvedValue({
        ...sampleStore,
        status: 'INACTIVE',
      } as any);

      await expect(
        userService.createStoreMember(sampleStore.id, {
          userId: sampleUser.id,
          role: 'CASHIER',
        })
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('deleteStoreMember', () => {
    it('should delete membership when found and belongs to store', async () => {
      vi.mocked(mockUserRepo.findMembershipById).mockResolvedValue(sampleMembership as any);
      vi.mocked(mockUserRepo.deleteMembership).mockResolvedValue(sampleMembership as any);

      await expect(
        userService.deleteStoreMember(sampleStore.id, sampleMembership.id)
      ).resolves.toBeUndefined();
      expect(mockUserRepo.deleteMembership).toHaveBeenCalledWith(sampleMembership.id);
    });

    it('should throw NotFoundError if membership does not match storeId', async () => {
      vi.mocked(mockUserRepo.findMembershipById).mockResolvedValue({
        ...sampleMembership,
        storeId: 'different-store-uuid',
      } as any);

      await expect(
        userService.deleteStoreMember(sampleStore.id, sampleMembership.id)
      ).rejects.toThrow(NotFoundError);
    });
  });
});
