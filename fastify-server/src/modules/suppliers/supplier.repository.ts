import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  CreateSupplierDto,
  CreateSupplierProductDto,
  SupplierProductQueryDto,
  SupplierQueryDto,
  UpdateSupplierDto,
  UpdateSupplierProductDto,
  UpdateSupplierStatusDto,
} from './supplier.types.js';

export type PrismaTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export class SupplierRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: PrismaTransactionClient): PrismaTransactionClient {
    return tx ?? this.prisma;
  }

  // ============================================================================
  // Supplier Operations
  // ============================================================================

  async createSupplier(data: CreateSupplierDto, tx?: PrismaTransactionClient) {
    const client = this.getClient(tx);
    return client.supplier.create({
      data: {
        name: data.name,
        code: data.code.toUpperCase(),
        email: data.email,
        phone: data.phone,
        website: data.website,
        taxIdentifier: data.taxIdentifier,
        addressLine1: data.addressLine1,
        addressLine2: data.addressLine2,
        city: data.city,
        state: data.state,
        postalCode: data.postalCode,
        countryCode: data.countryCode ? data.countryCode.toUpperCase() : undefined,
        notes: data.notes,
      },
    });
  }

  async findSupplierById(id: string, includeDeleted = false, tx?: PrismaTransactionClient) {
    const client = this.getClient(tx);
    return client.supplier.findFirst({
      where: {
        id,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      include: {
        _count: {
          select: { products: true, purchaseOrders: true },
        },
      },
    });
  }

  async findSupplierByCode(code: string, tx?: PrismaTransactionClient) {
    const client = this.getClient(tx);
    return client.supplier.findFirst({
      where: {
        code: code.toUpperCase(),
        deletedAt: null,
      },
    });
  }

  async listSuppliers(query: SupplierQueryDto, tx?: PrismaTransactionClient) {
    const client = this.getClient(tx);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.SupplierWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search.toUpperCase(), mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const [items, totalItems] = await Promise.all([
      client.supplier.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: { products: true },
          },
        },
      }),
      client.supplier.count({ where }),
    ]);

    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      items,
      meta: {
        page,
        limit: pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  async updateSupplier(id: string, data: UpdateSupplierDto, tx?: PrismaTransactionClient) {
    const client = this.getClient(tx);
    return client.supplier.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.website !== undefined ? { website: data.website } : {}),
        ...(data.taxIdentifier !== undefined ? { taxIdentifier: data.taxIdentifier } : {}),
        ...(data.addressLine1 !== undefined ? { addressLine1: data.addressLine1 } : {}),
        ...(data.addressLine2 !== undefined ? { addressLine2: data.addressLine2 } : {}),
        ...(data.city !== undefined ? { city: data.city } : {}),
        ...(data.state !== undefined ? { state: data.state } : {}),
        ...(data.postalCode !== undefined ? { postalCode: data.postalCode } : {}),
        ...(data.countryCode !== undefined
          ? { countryCode: data.countryCode ? data.countryCode.toUpperCase() : null }
          : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
      },
    });
  }

  async updateSupplierStatus(id: string, data: UpdateSupplierStatusDto, tx?: PrismaTransactionClient) {
    const client = this.getClient(tx);
    return client.supplier.update({
      where: { id },
      data: { status: data.status },
    });
  }

  async softDeleteSupplier(id: string, tx?: PrismaTransactionClient) {
    const client = this.getClient(tx);
    return client.supplier.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'INACTIVE',
      },
    });
  }

  async countSupplierPurchaseOrders(supplierId: string, tx?: PrismaTransactionClient): Promise<number> {
    const client = this.getClient(tx);
    return client.purchaseOrder.count({
      where: { supplierId },
    });
  }

  // ============================================================================
  // Supplier Product Catalog Operations
  // ============================================================================

  async findSupplierProduct(supplierId: string, variantId: string, tx?: PrismaTransactionClient) {
    const client = this.getClient(tx);
    return client.supplierProduct.findUnique({
      where: {
        uq_supplier_products_supplier_variant: {
          supplierId,
          variantId,
        },
      },
      include: {
        variant: {
          include: {
            product: {
              select: { id: true, name: true, slug: true, status: true },
            },
          },
        },
      },
    });
  }

  async findSupplierProductById(id: string, tx?: PrismaTransactionClient) {
    const client = this.getClient(tx);
    return client.supplierProduct.findUnique({
      where: { id },
      include: {
        supplier: {
          select: { id: true, name: true, code: true, status: true },
        },
        variant: {
          include: {
            product: {
              select: { id: true, name: true, slug: true, status: true },
            },
          },
        },
      },
    });
  }

  async createSupplierProduct(data: CreateSupplierProductDto, supplierId: string, tx?: PrismaTransactionClient) {
    const client = this.getClient(tx);
    return client.supplierProduct.create({
      data: {
        supplierId,
        variantId: data.variantId,
        supplierSku: data.supplierSku,
        supplierProductName: data.supplierProductName,
        purchasePrice: new Prisma.Decimal(data.purchasePrice.toString()),
        currencyCode: data.currencyCode ? data.currencyCode.toUpperCase() : 'USD',
        minimumOrderQuantity: new Prisma.Decimal(
          (data.minimumOrderQuantity ?? 1).toString()
        ),
        leadTimeDays: data.leadTimeDays,
        isPreferred: data.isPreferred ?? false,
      },
      include: {
        variant: {
          include: {
            product: {
              select: { id: true, name: true, slug: true, status: true },
            },
          },
        },
      },
    });
  }

  async updateSupplierProduct(
    id: string,
    data: UpdateSupplierProductDto,
    tx?: PrismaTransactionClient
  ) {
    const client = this.getClient(tx);
    return client.supplierProduct.update({
      where: { id },
      data: {
        ...(data.supplierSku !== undefined ? { supplierSku: data.supplierSku } : {}),
        ...(data.supplierProductName !== undefined
          ? { supplierProductName: data.supplierProductName }
          : {}),
        ...(data.purchasePrice !== undefined
          ? { purchasePrice: new Prisma.Decimal(data.purchasePrice.toString()) }
          : {}),
        ...(data.currencyCode !== undefined
          ? { currencyCode: data.currencyCode.toUpperCase() }
          : {}),
        ...(data.minimumOrderQuantity !== undefined
          ? { minimumOrderQuantity: new Prisma.Decimal(data.minimumOrderQuantity.toString()) }
          : {}),
        ...(data.leadTimeDays !== undefined ? { leadTimeDays: data.leadTimeDays } : {}),
        ...(data.isPreferred !== undefined ? { isPreferred: data.isPreferred } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      include: {
        variant: {
          include: {
            product: {
              select: { id: true, name: true, slug: true, status: true },
            },
          },
        },
      },
    });
  }

  async deleteSupplierProduct(id: string, tx?: PrismaTransactionClient) {
    const client = this.getClient(tx);
    return client.supplierProduct.delete({
      where: { id },
    });
  }

  async listSupplierProducts(
    supplierId: string,
    query: SupplierProductQueryDto,
    tx?: PrismaTransactionClient
  ) {
    const client = this.getClient(tx);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where: Prisma.SupplierProductWhereInput = {
      supplierId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.isPreferred !== undefined ? { isPreferred: query.isPreferred } : {}),
      ...(query.search
        ? {
            OR: [
              { supplierSku: { contains: query.search, mode: 'insensitive' } },
              { supplierProductName: { contains: query.search, mode: 'insensitive' } },
              { variant: { name: { contains: query.search, mode: 'insensitive' } } },
              { variant: { sku: { contains: query.search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, totalItems] = await Promise.all([
      client.supplierProduct.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          variant: {
            include: {
              product: {
                select: { id: true, name: true, slug: true, status: true },
              },
            },
          },
        },
      }),
      client.supplierProduct.count({ where }),
    ]);

    const totalPages = Math.ceil(totalItems / pageSize);

    return {
      items,
      meta: {
        page,
        limit: pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }
}
