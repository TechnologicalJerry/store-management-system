import { Prisma, type PrismaClient } from '@prisma/client';
import { SupplierRepository } from './supplier.repository.js';
import type {
  CreateSupplierDto,
  CreateSupplierProductDto,
  SupplierProductQueryDto,
  SupplierProductResponse,
  SupplierQueryDto,
  SupplierResponse,
  UpdateSupplierDto,
  UpdateSupplierProductDto,
  UpdateSupplierStatusDto,
} from './supplier.types.js';
import {
  DuplicateSupplierCodeError,
  DuplicateSupplierProductError,
  InactiveSupplierError,
  SupplierHasOrdersError,
  SupplierNotFoundError,
  SupplierProductNotFoundError,
} from './supplier.errors.js';
import { BadRequestError, NotFoundError } from '../../common/errors/app-error.js';

export class SupplierService {
  private readonly repository: SupplierRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.repository = new SupplierRepository(prisma);
  }

  // ============================================================================
  // Serialization Helpers
  // ============================================================================

  private serializeSupplier(supplier: any): SupplierResponse {
    return {
      id: supplier.id,
      name: supplier.name,
      code: supplier.code,
      email: supplier.email,
      phone: supplier.phone,
      website: supplier.website,
      taxIdentifier: supplier.taxIdentifier,
      addressLine1: supplier.addressLine1,
      addressLine2: supplier.addressLine2,
      city: supplier.city,
      state: supplier.state,
      postalCode: supplier.postalCode,
      countryCode: supplier.countryCode,
      status: supplier.status,
      notes: supplier.notes,
      createdAt: supplier.createdAt instanceof Date ? supplier.createdAt.toISOString() : supplier.createdAt,
      updatedAt: supplier.updatedAt instanceof Date ? supplier.updatedAt.toISOString() : supplier.updatedAt,
      productsCount: supplier._count?.products ?? 0,
    };
  }

  private serializeSupplierProduct(sp: any): SupplierProductResponse {
    return {
      id: sp.id,
      supplierId: sp.supplierId,
      variantId: sp.variantId,
      supplierSku: sp.supplierSku,
      supplierProductName: sp.supplierProductName,
      purchasePrice: new Prisma.Decimal(sp.purchasePrice.toString()).toFixed(2),
      currencyCode: sp.currencyCode,
      minimumOrderQuantity: new Prisma.Decimal(sp.minimumOrderQuantity.toString()).toFixed(4),
      leadTimeDays: sp.leadTimeDays,
      isPreferred: sp.isPreferred,
      status: sp.status,
      createdAt: sp.createdAt instanceof Date ? sp.createdAt.toISOString() : sp.createdAt,
      updatedAt: sp.updatedAt instanceof Date ? sp.updatedAt.toISOString() : sp.updatedAt,
      variant: sp.variant
        ? {
            id: sp.variant.id,
            name: sp.variant.name,
            sku: sp.variant.sku,
            barcode: sp.variant.barcode,
            status: sp.variant.status,
            product: {
              id: sp.variant.product.id,
              name: sp.variant.product.name,
              slug: sp.variant.product.slug,
              status: sp.variant.product.status,
            },
          }
        : undefined,
    };
  }

  // ============================================================================
  // Supplier Workflows
  // ============================================================================

  async createSupplier(dto: CreateSupplierDto): Promise<SupplierResponse> {
    const normalizedCode = dto.code.trim().toUpperCase();

    // Check code uniqueness
    const existing = await this.repository.findSupplierByCode(normalizedCode);
    if (existing) {
      throw new DuplicateSupplierCodeError();
    }

    const created = await this.repository.createSupplier({
      ...dto,
      code: normalizedCode,
    });

    return this.serializeSupplier(created);
  }

  async getSupplierById(id: string): Promise<SupplierResponse> {
    const supplier = await this.repository.findSupplierById(id);
    if (!supplier) {
      throw new SupplierNotFoundError();
    }
    return this.serializeSupplier(supplier);
  }

  async listSuppliers(query: SupplierQueryDto) {
    const result = await this.repository.listSuppliers(query);
    return {
      items: result.items.map(item => this.serializeSupplier(item)),
      meta: result.meta,
    };
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto): Promise<SupplierResponse> {
    const supplier = await this.repository.findSupplierById(id);
    if (!supplier) {
      throw new SupplierNotFoundError();
    }

    const updated = await this.repository.updateSupplier(id, dto);
    return this.serializeSupplier(updated);
  }

  async updateSupplierStatus(id: string, dto: UpdateSupplierStatusDto): Promise<SupplierResponse> {
    const supplier = await this.repository.findSupplierById(id);
    if (!supplier) {
      throw new SupplierNotFoundError();
    }

    const updated = await this.repository.updateSupplierStatus(id, dto);
    return this.serializeSupplier(updated);
  }

  async deleteSupplier(id: string): Promise<{ success: boolean; message: string }> {
    const supplier = await this.repository.findSupplierById(id);
    if (!supplier) {
      throw new SupplierNotFoundError();
    }

    // Check if supplier is referenced by existing purchase orders
    const poCount = await this.repository.countSupplierPurchaseOrders(id);
    if (poCount > 0) {
      throw new SupplierHasOrdersError();
    }

    await this.repository.softDeleteSupplier(id);
    return {
      success: true,
      message: `Supplier '${supplier.name}' (${supplier.code}) has been deactivated and removed.`,
    };
  }

  // ============================================================================
  // Supplier Product Catalog Workflows
  // ============================================================================

  async addSupplierProduct(
    supplierId: string,
    dto: CreateSupplierProductDto
  ): Promise<SupplierProductResponse> {
    // 1. Verify supplier exists and is active
    const supplier = await this.repository.findSupplierById(supplierId);
    if (!supplier) {
      throw new SupplierNotFoundError();
    }
    if (supplier.status !== 'ACTIVE') {
      throw new InactiveSupplierError('Cannot add product offerings to an inactive or suspended supplier.');
    }

    // 2. Verify variant exists and is active
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
      include: { product: true },
    });
    if (!variant) {
      throw new NotFoundError('Product variant not found.');
    }
    if (variant.status !== 'ACTIVE') {
      throw new BadRequestError(`Cannot link inactive variant '${variant.name}' to supplier catalog.`);
    }

    // 3. Check for existing relationship
    const existing = await this.repository.findSupplierProduct(supplierId, dto.variantId);
    if (existing) {
      throw new DuplicateSupplierProductError();
    }

    // 4. Validate non-negative pricing and positive MOQ
    const price = new Prisma.Decimal(dto.purchasePrice.toString());
    if (price.lessThan(0)) {
      throw new BadRequestError('Purchase price must be non-negative.');
    }

    const moq = new Prisma.Decimal((dto.minimumOrderQuantity ?? 1).toString());
    if (moq.lessThanOrEqualTo(0)) {
      throw new BadRequestError('Minimum order quantity must be greater than zero.');
    }

    const created = await this.repository.createSupplierProduct(
      {
        ...dto,
        purchasePrice: price,
        minimumOrderQuantity: moq,
      },
      supplierId
    );

    return this.serializeSupplierProduct(created);
  }

  async updateSupplierProduct(
    supplierId: string,
    supplierProductId: string,
    dto: UpdateSupplierProductDto
  ): Promise<SupplierProductResponse> {
    const sp = await this.repository.findSupplierProductById(supplierProductId);
    if (!sp || sp.supplierId !== supplierId) {
      throw new SupplierProductNotFoundError();
    }

    if (dto.purchasePrice !== undefined) {
      const price = new Prisma.Decimal(dto.purchasePrice.toString());
      if (price.lessThan(0)) {
        throw new BadRequestError('Purchase price must be non-negative.');
      }
    }

    if (dto.minimumOrderQuantity !== undefined) {
      const moq = new Prisma.Decimal(dto.minimumOrderQuantity.toString());
      if (moq.lessThanOrEqualTo(0)) {
        throw new BadRequestError('Minimum order quantity must be greater than zero.');
      }
    }

    const updated = await this.repository.updateSupplierProduct(supplierProductId, dto);
    return this.serializeSupplierProduct(updated);
  }

  async removeSupplierProduct(
    supplierId: string,
    supplierProductId: string
  ): Promise<{ success: boolean; message: string }> {
    const sp = await this.repository.findSupplierProductById(supplierProductId);
    if (!sp || sp.supplierId !== supplierId) {
      throw new SupplierProductNotFoundError();
    }

    await this.repository.deleteSupplierProduct(supplierProductId);
    return {
      success: true,
      message: 'Product variant successfully removed from supplier catalog.',
    };
  }

  async listSupplierProducts(supplierId: string, query: SupplierProductQueryDto) {
    const supplier = await this.repository.findSupplierById(supplierId);
    if (!supplier) {
      throw new SupplierNotFoundError();
    }

    const result = await this.repository.listSupplierProducts(supplierId, query);
    return {
      items: result.items.map(item => this.serializeSupplierProduct(item)),
      meta: result.meta,
    };
  }
}
