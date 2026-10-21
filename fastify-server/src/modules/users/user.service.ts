import type { User, UserRole, StoreMembership } from '@prisma/client';
import type { UserRepository } from './user.repository.js';
import type { StoreRepository } from '../stores/store.repository.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { buildPaginatedResponse, parsePagination } from '../../common/utils/pagination.js';
import type { Role } from '../auth/auth.types.js';
import type {
  CreateStoreMemberDto,
  MembershipStatus,
  PaginatedStoreMembersResponse,
  PaginatedUsersResponse,
  StoreMemberQueryDto,
  StoreMemberResponseDto,
  UpdateStoreMemberDto,
  UpdateUserDto,
  UpdateUserStatusDto,
  UserAdminResponseDto,
  UserQueryDto,
  UserStatus,
} from './user.types.js';

export class UserService {
  constructor(
    private readonly userRepo: UserRepository,
    private readonly storeRepo: StoreRepository
  ) {}

  public formatUser(user: User & { roles: UserRole[] }): UserAdminResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      status: user.status as UserStatus,
      roles: user.roles.map(r => r.role as Role),
      emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
      lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  public formatStoreMember(
    member: StoreMembership & {
      user: { id: string; email: string; name: string; status: string };
    }
  ): StoreMemberResponseDto {
    return {
      id: member.id,
      userId: member.userId,
      storeId: member.storeId,
      role: member.role as Role,
      status: member.status as MembershipStatus,
      user: {
        id: member.user.id,
        email: member.user.email,
        name: member.user.name,
        status: member.user.status as UserStatus,
      },
      createdAt: member.createdAt.toISOString(),
      updatedAt: member.updatedAt.toISOString(),
    };
  }

  // ==========================================
  // User Administration
  // ==========================================

  public async getUserById(userId: string): Promise<UserAdminResponseDto> {
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError(`User with ID '${userId}' not found.`);
    }
    return this.formatUser(user);
  }

  public async listUsers(query: UserQueryDto): Promise<PaginatedUsersResponse> {
    const { page, limit, skip, take, sortBy, sortOrder } = parsePagination(query, {
      defaultLimit: 20,
      defaultSortBy: 'createdAt',
      defaultSortOrder: 'desc',
    });

    const [users, totalItems] = await Promise.all([
      this.userRepo.findManyUsers({
        skip,
        take,
        status: query.status,
        role: query.role,
        search: query.search?.trim(),
        sortBy,
        sortOrder,
      }),
      this.userRepo.countUsers({
        status: query.status,
        role: query.role,
        search: query.search?.trim(),
      }),
    ]);

    const formattedUsers = users.map(u => this.formatUser(u));
    return buildPaginatedResponse(formattedUsers, totalItems, page, limit);
  }

  public async updateUser(userId: string, input: UpdateUserDto): Promise<UserAdminResponseDto> {
    const existing = await this.userRepo.findById(userId);
    if (!existing) {
      throw new NotFoundError(`User with ID '${userId}' not found.`);
    }

    if (input.email) {
      const normalizedEmail = input.email.trim().toLowerCase();
      if (normalizedEmail !== existing.email) {
        const emailTaken = await this.userRepo.findByEmail(normalizedEmail);
        if (emailTaken) {
          throw new ConflictError(`Email address '${normalizedEmail}' is already registered.`);
        }
      }
    }

    const updated = await this.userRepo.updateUser(userId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.email !== undefined ? { email: input.email.trim().toLowerCase() } : {}),
    });

    return this.formatUser(updated);
  }

  public async updateUserStatus(
    userId: string,
    input: UpdateUserStatusDto
  ): Promise<UserAdminResponseDto> {
    const existing = await this.userRepo.findById(userId);
    if (!existing) {
      throw new NotFoundError(`User with ID '${userId}' not found.`);
    }

    // Safeguard: Prevent deactivating or suspending the final active SUPER_ADMIN
    const isSuperAdmin = existing.roles.some(r => r.role === 'SUPER_ADMIN');
    if (isSuperAdmin && (input.status === 'SUSPENDED' || input.status === 'DEACTIVATED')) {
      const activeSuperAdmins = await this.userRepo.countSuperAdmins();
      if (activeSuperAdmins <= 1) {
        throw new BadRequestError('Cannot suspend or deactivate the final active SUPER_ADMIN account.');
      }
    }

    const updated = await this.userRepo.updateUser(userId, {
      status: input.status,
    });

    return this.formatUser(updated);
  }

  // ==========================================
  // Store Memberships
  // ==========================================

  public async listStoreMembers(
    storeId: string,
    query: StoreMemberQueryDto
  ): Promise<PaginatedStoreMembersResponse> {
    // Verify target store exists
    const store = await this.storeRepo.findById(storeId);
    if (!store) {
      throw new NotFoundError(`Store with ID '${storeId}' not found.`);
    }

    const { page, limit, skip, take } = parsePagination(query, {
      defaultLimit: 20,
    });

    const [members, totalItems] = await Promise.all([
      this.userRepo.findStoreMembers({
        storeId,
        skip,
        take,
        status: query.status,
        role: query.role,
      }),
      this.userRepo.countStoreMembers({
        storeId,
        status: query.status,
        role: query.role,
      }),
    ]);

    const formattedMembers = members.map(m => this.formatStoreMember(m));
    return buildPaginatedResponse(formattedMembers, totalItems, page, limit);
  }

  public async createStoreMember(
    storeId: string,
    input: CreateStoreMemberDto,
    actingUserId?: string
  ): Promise<StoreMemberResponseDto> {
    // 1. Verify target store exists and is ACTIVE
    const store = await this.storeRepo.findById(storeId);
    if (!store) {
      throw new NotFoundError(`Store with ID '${storeId}' not found.`);
    }
    if (store.status !== 'ACTIVE') {
      throw new BadRequestError(`Cannot assign members to an inactive or suspended store.`);
    }

    // 2. Verify target user exists and is ACTIVE
    const user = await this.userRepo.findById(input.userId);
    if (!user) {
      throw new NotFoundError(`User with ID '${input.userId}' not found.`);
    }
    if (user.status !== 'ACTIVE') {
      throw new BadRequestError(`Cannot assign an inactive or suspended user to a store.`);
    }

    // 3. Prevent duplicate membership
    const existingMembership = await this.userRepo.findMembershipByUserAndStore(input.userId, storeId);
    if (existingMembership) {
      throw new ConflictError(`User is already a member of this store.`);
    }

    const member = await this.userRepo.createMembership({
      user: { connect: { id: input.userId } },
      store: { connect: { id: storeId } },
      role: input.role,
      status: 'ACTIVE',
      ...(actingUserId ? { createdByUser: { connect: { id: actingUserId } } } : {}),
    });

    return this.formatStoreMember(member);
  }

  public async updateStoreMember(
    storeId: string,
    membershipId: string,
    input: UpdateStoreMemberDto
  ): Promise<StoreMemberResponseDto> {
    const existing = await this.userRepo.findMembershipById(membershipId);
    if (!existing || existing.storeId !== storeId) {
      throw new NotFoundError(`Membership with ID '${membershipId}' not found in this store.`);
    }

    const updated = await this.userRepo.updateMembership(membershipId, {
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    });

    return this.formatStoreMember(updated);
  }

  public async deleteStoreMember(storeId: string, membershipId: string): Promise<void> {
    const existing = await this.userRepo.findMembershipById(membershipId);
    if (!existing || existing.storeId !== storeId) {
      throw new NotFoundError(`Membership with ID '${membershipId}' not found in this store.`);
    }

    await this.userRepo.deleteMembership(membershipId);
  }
}
