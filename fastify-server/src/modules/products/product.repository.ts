import type { Prisma, PrismaClient } from '@prisma/client';
import type { DatabaseTransactionClient } from '../../infrastructure/database/database.types.js';
import type { ProductStatus, VariantStatus } from './product.types.js';

export class ProductRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: DatabaseTransactionClient): PrismaClient | DatabaseTransactionClient {
    return tx ?? this.prisma;
  }

  // ==========================================
  // Product Operations
  // ==========================================

  public async findById(id: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
        variants: true,
      },
    });
  }

  public async findBySlug(slug: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.product.findFirst({
      where: { slug: slug.toLowerCase().trim(), deletedAt: null },
    });
  }

  public async create(
    data: Prisma.ProductCreateInput,
    tx?: DatabaseTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.product.create({
      data,
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
        variants: true,
      },
    });
  }

  public async update(
    id: string,
    data: Prisma.ProductUpdateInput,
    tx?: DatabaseTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.product.update({
      where: { id },
      data,
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
        variants: true,
      },
    });
  }

  public async findMany(params: {
    skip: number;
    take: number;
    categoryId?: string;
    status?: ProductStatus;
    brand?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.brand ? { brand: { equals: params.brand, mode: 'insensitive' } } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { slug: { contains: params.search, mode: 'insensitive' } },
              { brand: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const validSortFields = ['name', 'slug', 'createdAt', 'status'];
    const sortField = params.sortBy && validSortFields.includes(params.sortBy) ? params.sortBy : 'createdAt';
    const orderBy: Prisma.ProductOrderByWithRelationInput = {
      [sortField]: params.sortOrder ?? 'desc',
    };

    return this.prisma.product.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy,
      include: {
        category: {
          select: { id: true, name: true, slug: true },
        },
        variants: true,
      },
    });
  }

  public async count(params: {
    categoryId?: string;
    status?: ProductStatus;
    brand?: string;
    search?: string;
  }): Promise<number> {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(params.categoryId ? { categoryId: params.categoryId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.brand ? { brand: { equals: params.brand, mode: 'insensitive' } } : {}),
      ...(params.search
        ? {
            OR: [
              { name: { contains: params.search, mode: 'insensitive' } },
              { slug: { contains: params.search, mode: 'insensitive' } },
              { brand: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return this.prisma.product.count({ where });
  }

  // ==========================================
  // Product Variant Operations
  // ==========================================

  public async findVariantById(id: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.productVariant.findUnique({
      where: { id },
    });
  }

  public async findVariantBySku(sku: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.productVariant.findUnique({
      where: { sku: sku.toUpperCase().trim() },
    });
  }

  public async findVariantByBarcode(barcode: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.productVariant.findUnique({
      where: { barcode: barcode.trim() },
    });
  }

  public async findVariantsByProductId(productId: string, tx?: DatabaseTransactionClient) {
    const client = this.getClient(tx);
    return client.productVariant.findMany({
      where: { productId },
      orderBy: { createdAt: 'asc' },
    });
  }

  public async createVariant(
    data: Prisma.ProductVariantCreateInput,
    tx?: DatabaseTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.productVariant.create({ data });
  }

  public async updateVariant(
    id: string,
    data: Prisma.ProductVariantUpdateInput,
    tx?: DatabaseTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.productVariant.update({
      where: { id },
      data,
    });
  }
}
