import type { Prisma, PrismaClient } from '@prisma/client';
import type { DatabaseTransactionClient } from '../../infrastructure/database/database.types.js';
import type { CategoryStatus } from './category.types.js';

export class CategoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: DatabaseTransactionClient): PrismaClient | DatabaseTransactionClient {
    return tx ?? this.prisma;
  }

  public async findById(id: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.productCategory.findUnique({
      where: { id },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }

  public async findBySlug(slug: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.productCategory.findUnique({
      where: { slug: slug.toLowerCase().trim() },
    });
  }

  public async create(
    data: Prisma.ProductCategoryCreateInput,
    tx?: DatabaseTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.productCategory.create({
      data,
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }

  public async update(
    id: string,
    data: Prisma.ProductCategoryUpdateInput,
    tx?: DatabaseTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.productCategory.update({
      where: { id },
      data,
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }

  public async delete(id: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.productCategory.delete({
      where: { id },
    });
  }

  public async countProductsInCategory(categoryId: string, tx?: DatabaseTransactionClient): Promise<number> {
    const client = this.getClient(tx);
    return client.product.count({
      where: { categoryId, deletedAt: null },
    });
  }

  public async countChildren(categoryId: string, tx?: DatabaseTransactionClient): Promise<number> {
    const client = this.getClient(tx);
    return client.productCategory.count({
      where: { parentId: categoryId },
    });
  }

  public async findMany(params: {
    skip: number;
    take: number;
    parentId?: string;
    status?: CategoryStatus;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const where: Prisma.ProductCategoryWhereInput = {
      ...(params.parentId !== undefined ? { parentId: params.parentId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { slug: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const validSortFields = ['name', 'slug', 'createdAt', 'status'];
    const sortField = params.sortBy && validSortFields.includes(params.sortBy) ? params.sortBy : 'name';
    const orderBy: Prisma.ProductCategoryOrderByWithRelationInput = {
      [sortField]: params.sortOrder ?? 'asc',
    };

    return this.prisma.productCategory.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy,
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
  }

  public async count(params: {
    parentId?: string;
    status?: CategoryStatus;
    search?: string;
  }): Promise<number> {
    const where: Prisma.ProductCategoryWhereInput = {
      ...(params.parentId !== undefined ? { parentId: params.parentId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { slug: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.productCategory.count({ where });
  }
}
