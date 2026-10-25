import { Prisma, type PrismaClient, type Product, type ProductVariant } from '@prisma/client';
import type { ProductRepository } from './product.repository.js';
import type { CategoryRepository } from '../categories/category.repository.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { buildPaginatedResponse, parsePagination } from '../../common/utils/pagination.js';
import { getCacheService } from '../../infrastructure/redis/cache.service.js';
import type {
  CreateProductDto,
  CreateProductVariantDto,
  PaginatedProductsResponse,
  ProductQueryDto,
  ProductResponseDto,
  ProductStatus,
  ProductVariantResponseDto,
  UpdateProductDto,
  UpdateProductStatusDto,
  UpdateVariantDto,
  UpdateVariantStatusDto,
  VariantStatus,
} from './product.types.js';

export class ProductService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly productRepo: ProductRepository,
    private readonly categoryRepo: CategoryRepository
  ) {}

  public slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  public toDecimal(value: number | string): Prisma.Decimal {
    const num = Number(value);
    if (isNaN(num) || num < 0) {
      throw new BadRequestError(`Invalid monetary price value: '${value}'. Price must be a non-negative number.`);
    }
    return new Prisma.Decimal(num.toFixed(2));
  }

  public formatVariant(variant: ProductVariant): ProductVariantResponseDto {
    return {
      id: variant.id,
      productId: variant.productId,
      name: variant.name,
      sku: variant.sku,
      barcode: variant.barcode,
      price: variant.price.toFixed(2),
      costPrice: variant.costPrice ? variant.costPrice.toFixed(2) : null,
      currency: variant.currency,
      taxCategory: variant.taxCategory,
      attributes: (variant.attributes as Record<string, unknown>) ?? null,
      status: variant.status as VariantStatus,
      createdAt: variant.createdAt.toISOString(),
      updatedAt: variant.updatedAt.toISOString(),
    };
  }

  public formatProduct(
    product: Product & {
      category?: { id: string; name: string; slug: string } | null;
      variants?: ProductVariant[];
    }
  ): ProductResponseDto {
    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      categoryId: product.categoryId,
      brand: product.brand,
      status: product.status as ProductStatus,
      category: product.category ?? undefined,
      variants: product.variants ? product.variants.map(v => this.formatVariant(v)) : undefined,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  // ==========================================
  // Product Operations
  // ==========================================

  public async createProduct(input: CreateProductDto): Promise<ProductResponseDto> {
    // 1. Verify category exists and is ACTIVE
    const category = await this.categoryRepo.findById(input.categoryId);
    if (!category) {
      throw new NotFoundError(`Category with ID '${input.categoryId}' not found.`);
    }
    if (category.status !== 'ACTIVE') {
      throw new BadRequestError(`Cannot assign a product to an inactive category.`);
    }

    // 2. Resolve and verify slug uniqueness
    const slug = (input.slug ? this.slugify(input.slug) : this.slugify(input.name)) || 'product';
    const existingSlug = await this.productRepo.findBySlug(slug);
    if (existingSlug) {
      throw new ConflictError(`Product with slug '${slug}' already exists.`);
    }

    // 3. Pre-validate initial variant if provided
    if (input.initialVariant) {
      const normalizedSku = input.initialVariant.sku.toUpperCase().trim();
      const existingSku = await this.productRepo.findVariantBySku(normalizedSku);
      if (existingSku) {
        throw new ConflictError(`Variant with SKU '${normalizedSku}' already exists.`);
      }

      if (input.initialVariant.barcode) {
        const normalizedBarcode = input.initialVariant.barcode.trim();
        const existingBarcode = await this.productRepo.findVariantByBarcode(normalizedBarcode);
        if (existingBarcode) {
          throw new ConflictError(`Variant with barcode '${normalizedBarcode}' already exists.`);
        }
      }
    }

    // 4. Create product (and initial variant) transactionally
    const created = await this.prisma.$transaction(async tx => {
      const product = await this.productRepo.create(
        {
          name: input.name.trim(),
          slug,
          description: input.description?.trim(),
          brand: input.brand?.trim(),
          status: input.status ?? 'DRAFT',
          category: { connect: { id: input.categoryId } },
        },
        tx
      );

      if (input.initialVariant) {
        await this.productRepo.createVariant(
          {
            product: { connect: { id: product.id } },
            name: input.initialVariant.name.trim(),
            sku: input.initialVariant.sku.toUpperCase().trim(),
            barcode: input.initialVariant.barcode?.trim() || null,
            price: this.toDecimal(input.initialVariant.price),
            costPrice: input.initialVariant.costPrice !== undefined ? this.toDecimal(input.initialVariant.costPrice) : null,
            currency: input.initialVariant.currency?.trim().toUpperCase() || 'USD',
            taxCategory: input.initialVariant.taxCategory?.trim() || 'STANDARD',
            attributes: input.initialVariant.attributes ? (input.initialVariant.attributes as Prisma.InputJsonValue) : Prisma.JsonNull,
            status: input.initialVariant.status ?? 'ACTIVE',
          },
          tx
        );
      }

      return this.productRepo.findById(product.id, tx);
    });

    if (!created) {
      throw new NotFoundError('Failed to retrieve newly created product.');
    }

    return this.formatProduct(created);
  }

  public async getProductById(productId: string): Promise<ProductResponseDto> {
    const cache = getCacheService();
    const cacheKey = cache.buildKey('catalog:product', productId);
    return cache.getOrSet(
      cacheKey,
      async () => {
        const product = await this.productRepo.findById(productId);
        if (!product) {
          throw new NotFoundError(`Product with ID '${productId}' not found.`);
        }
        return this.formatProduct(product);
      },
      { ttlSeconds: cache.getProductTtl() }
    );
  }

  public async listProducts(query: ProductQueryDto): Promise<PaginatedProductsResponse> {
    const { page, limit, skip, take, sortBy, sortOrder } = parsePagination(query, {
      defaultLimit: 20,
      defaultSortBy: 'createdAt',
      defaultSortOrder: 'desc',
    });

    const [products, totalItems] = await Promise.all([
      this.productRepo.findMany({
        skip,
        take,
        categoryId: query.categoryId,
        status: query.status,
        brand: query.brand?.trim(),
        search: query.search?.trim(),
        sortBy,
        sortOrder,
      }),
      this.productRepo.count({
        categoryId: query.categoryId,
        status: query.status,
        brand: query.brand?.trim(),
        search: query.search?.trim(),
      }),
    ]);

    const formatted = products.map(p => this.formatProduct(p));
    return buildPaginatedResponse(formatted, totalItems, page, limit);
  }

  public async updateProduct(
    productId: string,
    input: UpdateProductDto
  ): Promise<ProductResponseDto> {
    const existing = await this.productRepo.findById(productId);
    if (!existing) {
      throw new NotFoundError(`Product with ID '${productId}' not found.`);
    }

    // Slug check if slug changed
    let updatedSlug: string | undefined;
    if (input.slug !== undefined) {
      const candidateSlug = this.slugify(input.slug);
      if (candidateSlug !== existing.slug) {
        const slugExists = await this.productRepo.findBySlug(candidateSlug);
        if (slugExists) {
          throw new ConflictError(`Product with slug '${candidateSlug}' already exists.`);
        }
        updatedSlug = candidateSlug;
      }
    }

    // Category check if categoryId changed
    if (input.categoryId !== undefined && input.categoryId !== existing.categoryId) {
      const category = await this.categoryRepo.findById(input.categoryId);
      if (!category) {
        throw new NotFoundError(`Category with ID '${input.categoryId}' not found.`);
      }
      if (category.status !== 'ACTIVE') {
        throw new BadRequestError(`Cannot reassign a product to an inactive category.`);
      }
    }

    const updated = await this.productRepo.update(productId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(updatedSlug !== undefined ? { slug: updatedSlug } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.brand !== undefined ? { brand: input.brand.trim() } : {}),
      ...(input.categoryId !== undefined ? { category: { connect: { id: input.categoryId } } } : {}),
    });

    // Invalidate product cache after successful database update
    void getCacheService().invalidateProduct(productId).catch(() => {});

    return this.formatProduct(updated);
  }

  public async updateProductStatus(
    productId: string,
    input: UpdateProductStatusDto
  ): Promise<ProductResponseDto> {
    const existing = await this.productRepo.findById(productId);
    if (!existing) {
      throw new NotFoundError(`Product with ID '${productId}' not found.`);
    }

    const updated = await this.productRepo.update(productId, {
      status: input.status,
    });

    // Invalidate product cache after status update
    void getCacheService().invalidateProduct(productId).catch(() => {});

    return this.formatProduct(updated);
  }

  // ==========================================
  // Product Variant Operations
  // ==========================================

  public async createVariant(
    productId: string,
    input: CreateProductVariantDto
  ): Promise<ProductVariantResponseDto> {
    // 1. Verify parent product exists and is not archived
    const product = await this.productRepo.findById(productId);
    if (!product) {
      throw new NotFoundError(`Product with ID '${productId}' not found.`);
    }
    if (product.status === 'ARCHIVED') {
      throw new BadRequestError(`Cannot add variants to an ARCHIVED product.`);
    }

    // 2. Validate SKU uniqueness
    const normalizedSku = input.sku.toUpperCase().trim();
    const existingSku = await this.productRepo.findVariantBySku(normalizedSku);
    if (existingSku) {
      throw new ConflictError(`Variant with SKU '${normalizedSku}' already exists.`);
    }

    // 3. Validate Barcode uniqueness
    if (input.barcode) {
      const normalizedBarcode = input.barcode.trim();
      const existingBarcode = await this.productRepo.findVariantByBarcode(normalizedBarcode);
      if (existingBarcode) {
        throw new ConflictError(`Variant with barcode '${normalizedBarcode}' already exists.`);
      }
    }

    const variant = await this.productRepo.createVariant({
      product: { connect: { id: productId } },
      name: input.name.trim(),
      sku: normalizedSku,
      barcode: input.barcode?.trim() || null,
      price: this.toDecimal(input.price),
      costPrice: input.costPrice !== undefined ? this.toDecimal(input.costPrice) : null,
      currency: input.currency?.trim().toUpperCase() || 'USD',
      taxCategory: input.taxCategory?.trim() || 'STANDARD',
      attributes: input.attributes ? (input.attributes as Prisma.InputJsonValue) : Prisma.JsonNull,
      status: input.status ?? 'ACTIVE',
    });

    return this.formatVariant(variant);
  }

  public async getVariantsByProductId(productId: string): Promise<ProductVariantResponseDto[]> {
    const product = await this.productRepo.findById(productId);
    if (!product) {
      throw new NotFoundError(`Product with ID '${productId}' not found.`);
    }

    const variants = await this.productRepo.findVariantsByProductId(productId);
    return variants.map(v => this.formatVariant(v));
  }

  public async getVariantById(variantId: string): Promise<ProductVariantResponseDto> {
    const variant = await this.productRepo.findVariantById(variantId);
    if (!variant) {
      throw new NotFoundError(`Variant with ID '${variantId}' not found.`);
    }
    return this.formatVariant(variant);
  }

  public async updateVariant(
    variantId: string,
    input: UpdateVariantDto
  ): Promise<ProductVariantResponseDto> {
    const existing = await this.productRepo.findVariantById(variantId);
    if (!existing) {
      throw new NotFoundError(`Variant with ID '${variantId}' not found.`);
    }

    // Validate SKU uniqueness if changing
    let updatedSku: string | undefined;
    if (input.sku !== undefined) {
      const candidateSku = input.sku.toUpperCase().trim();
      if (candidateSku !== existing.sku) {
        const skuExists = await this.productRepo.findVariantBySku(candidateSku);
        if (skuExists) {
          throw new ConflictError(`Variant with SKU '${candidateSku}' already exists.`);
        }
        updatedSku = candidateSku;
      }
    }

    // Validate Barcode uniqueness if changing
    let updatedBarcode: string | null | undefined;
    if (input.barcode !== undefined) {
      if (input.barcode === null || input.barcode.trim() === '') {
        updatedBarcode = null;
      } else {
        const candidateBarcode = input.barcode.trim();
        if (candidateBarcode !== existing.barcode) {
          const barcodeExists = await this.productRepo.findVariantByBarcode(candidateBarcode);
          if (barcodeExists) {
            throw new ConflictError(`Variant with barcode '${candidateBarcode}' already exists.`);
          }
          updatedBarcode = candidateBarcode;
        }
      }
    }

    const updated = await this.productRepo.updateVariant(variantId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(updatedSku !== undefined ? { sku: updatedSku } : {}),
      ...(updatedBarcode !== undefined ? { barcode: updatedBarcode } : {}),
      ...(input.price !== undefined ? { price: this.toDecimal(input.price) } : {}),
      ...(input.costPrice !== undefined
        ? { costPrice: input.costPrice === null ? null : this.toDecimal(input.costPrice) }
        : {}),
      ...(input.currency !== undefined ? { currency: input.currency.trim().toUpperCase() } : {}),
      ...(input.taxCategory !== undefined ? { taxCategory: input.taxCategory.trim() } : {}),
      ...(input.attributes !== undefined
        ? { attributes: (input.attributes as Prisma.InputJsonValue) ?? Prisma.JsonNull }
        : {}),
    });

    return this.formatVariant(updated);
  }

  public async updateVariantStatus(
    variantId: string,
    input: UpdateVariantStatusDto
  ): Promise<ProductVariantResponseDto> {
    const existing = await this.productRepo.findVariantById(variantId);
    if (!existing) {
      throw new NotFoundError(`Variant with ID '${variantId}' not found.`);
    }

    const updated = await this.productRepo.updateVariant(variantId, {
      status: input.status,
    });

    return this.formatVariant(updated);
  }
}
