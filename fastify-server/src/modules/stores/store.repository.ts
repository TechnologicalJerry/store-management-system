import type { Prisma, PrismaClient } from '@prisma/client';
import type { DatabaseTransactionClient } from '../../infrastructure/database/database.types.js';
import type { StoreStatus } from './store.types.js';

export class StoreRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: DatabaseTransactionClient): PrismaClient | DatabaseTransactionClient {
    return tx ?? this.prisma;
  }

  public async findById(id: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.store.findFirst({
      where: { id, deletedAt: null },
    });
  }

  public async findByCode(code: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.store.findFirst({
      where: { code: code.toUpperCase().trim(), deletedAt: null },
    });
  }

  public async create(
    data: Prisma.StoreCreateInput,
    tx?: DatabaseTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.store.create({ data });
  }

  public async update(
    id: string,
    data: Prisma.StoreUpdateInput,
    tx?: DatabaseTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.store.update({
      where: { id },
      data,
    });
  }

  public async findMany(params: {
    skip: number;
    take: number;
    status?: StoreStatus;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const where: Prisma.StoreWhereInput = {
      deletedAt: null,
      ...(params.status ? { status: params.status } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { code: { contains: params.search, mode: 'insensitive' } },
              { city: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const validSortFields = ['name', 'code', 'createdAt', 'status'];
    const sortField = params.sortBy && validSortFields.includes(params.sortBy) ? params.sortBy : 'createdAt';
    const orderBy: Prisma.StoreOrderByWithRelationInput = {
      [sortField]: params.sortOrder ?? 'desc',
    };

    return this.prisma.store.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy,
    });
  }

  public async count(params: {
    status?: StoreStatus;
    search?: string;
  }): Promise<number> {
    const where: Prisma.StoreWhereInput = {
      deletedAt: null,
      ...(params.status ? { status: params.status } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { code: { contains: params.search, mode: 'insensitive' } },
              { city: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.store.count({ where });
  }
}
