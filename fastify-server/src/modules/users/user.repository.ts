import type { Prisma, PrismaClient, Role } from '@prisma/client';
import type { DatabaseTransactionClient } from '../../infrastructure/database/database.types.js';
import type { MembershipStatus, UserStatus } from './user.types.js';

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: DatabaseTransactionClient): PrismaClient | DatabaseTransactionClient {
    return tx ?? this.prisma;
  }

  // ==========================================
  // User Operations
  // ==========================================

  public async findById(id: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.user.findUnique({
      where: { id },
      include: { roles: true },
    });
  }

  public async findByEmail(email: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.user.findUnique({
      where: { email },
      include: { roles: true },
    });
  }

  public async countSuperAdmins(tx?: DatabaseTransactionClient): Promise<number> {
    const client = this.getClient(tx);
    return client.user.count({
      where: {
        status: 'ACTIVE',
        roles: {
          some: {
            role: 'SUPER_ADMIN',
          },
        },
      },
    });
  }

  public async updateUser(
    id: string,
    data: Prisma.UserUpdateInput,
    tx?: DatabaseTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.user.update({
      where: { id },
      data,
      include: { roles: true },
    });
  }

  public async findManyUsers(params: {
    skip: number;
    take: number;
    status?: UserStatus;
    role?: Role;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const where: Prisma.UserWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.role
        ? {
            roles: {
              some: { role: params.role },
            },
          }
        : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { email: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const validSortFields = ['name', 'email', 'createdAt', 'status'];
    const sortField = params.sortBy && validSortFields.includes(params.sortBy) ? params.sortBy : 'createdAt';
    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [sortField]: params.sortOrder ?? 'desc',
    };

    return this.prisma.user.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy,
      include: { roles: true },
    });
  }

  public async countUsers(params: {
    status?: UserStatus;
    role?: Role;
    search?: string;
  }): Promise<number> {
    const where: Prisma.UserWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.role
        ? {
            roles: {
              some: { role: params.role },
            },
          }
        : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { email: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.user.count({ where });
  }

  // ==========================================
  // Store Membership Operations
  // ==========================================

  public async findMembershipById(id: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.storeMembership.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
          },
        },
        store: true,
      },
    });
  }

  public async findMembershipByUserAndStore(
    userId: string,
    storeId: string,
    tx?: DatabaseTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.storeMembership.findFirst({
      where: { userId, storeId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
          },
        },
      },
    });
  }

  public async createMembership(
    data: Prisma.StoreMembershipCreateInput,
    tx?: DatabaseTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.storeMembership.create({
      data,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
          },
        },
      },
    });
  }

  public async updateMembership(
    id: string,
    data: Prisma.StoreMembershipUpdateInput,
    tx?: DatabaseTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.storeMembership.update({
      where: { id },
      data,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
          },
        },
      },
    });
  }

  public async deleteMembership(id: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.storeMembership.delete({
      where: { id },
    });
  }

  public async findStoreMembers(params: {
    storeId: string;
    skip: number;
    take: number;
    status?: MembershipStatus;
    role?: Role;
  }) {
    const where: Prisma.StoreMembershipWhereInput = {
      storeId: params.storeId,
      ...(params.status ? { status: params.status } : {}),
      ...(params.role ? { role: params.role } : {}),
    };

    return this.prisma.storeMembership.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            status: true,
          },
        },
      },
    });
  }

  public async countStoreMembers(params: {
    storeId: string;
    status?: MembershipStatus;
    role?: Role;
  }): Promise<number> {
    const where: Prisma.StoreMembershipWhereInput = {
      storeId: params.storeId,
      ...(params.status ? { status: params.status } : {}),
      ...(params.role ? { role: params.role } : {}),
    };

    return this.prisma.storeMembership.count({ where });
  }
}
