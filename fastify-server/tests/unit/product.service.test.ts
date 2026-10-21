import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ProductService } from '../../src/modules/products/product.service.js';
import type { ProductRepository } from '../../src/modules/products/product.repository.js';
import type { CategoryRepository } from '../../src/modules/categories/category.repository.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../src/common/errors/app-error.js';

describe('ProductService (Unit)', () => {
  let mockPrisma: PrismaClient;
  let mockProductRepo: ProductRepository;
  let mockCategoryRepo: CategoryRepository;
  let productService: ProductService;

  const mockDate = new Date('2026-10-21T10:00:00Z');
  const sampleCategory = {
    id: 'cat-uuid-1',
    name: 'Beverages',
    slug: 'beverages',
    description: null,
    parentId: null,
    status: 'ACTIVE' as const,
    createdAt: mockDate,
    updatedAt: mockDate,
    parent: null,
  };

  const sampleVariant = {
    id: 'var-uuid-1',
    productId: 'prod-uuid-1',
    name: 'Standard 250g',
    sku: 'COFFEE-250G',
    barcode: '8901234567890',
    price: new Prisma.Decimal('14.99'),
    costPrice: new Prisma.Decimal('7.50'),
    currency: 'USD',
    taxCategory: 'STANDARD',
    attributes: { weight: '250g' },
    status: 'ACTIVE' as const,
    createdAt: mockDate,
    updatedAt: mockDate,
  };

  const sampleProduct = {
    id: 'prod-uuid-1',
    name: 'Artisan Roast Coffee',
    slug: 'artisan-roast-coffee',
    description: 'Fresh whole beans',
    categoryId: 'cat-uuid-1',
    brand: 'Artisan Co',
    status: 'ACTIVE' as const,
    createdAt: mockDate,
    updatedAt: mockDate,
    deletedAt: null,
    category: sampleCategory,
    variants: [sampleVariant],
  };

  beforeEach(() => {
    mockPrisma = {
      $transaction: vi.fn().mockImplementation(async (callback: (tx: any) => Promise<any>) => {
        return callback(mockPrisma);
      }),
    } as unknown as PrismaClient;

    mockProductRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findVariantById: vi.fn(),
      findVariantBySku: vi.fn(),
      findVariantByBarcode: vi.fn(),
      findVariantsByProductId: vi.fn(),
      createVariant: vi.fn(),
      updateVariant: vi.fn(),
    } as unknown as ProductRepository;

    mockCategoryRepo = {
      findById: vi.fn(),
    } as unknown as CategoryRepository;

    productService = new ProductService(mockPrisma, mockProductRepo, mockCategoryRepo);
  });

  describe('toDecimal and pricing validation', () => {
    it('should convert valid positive number to Prisma.Decimal with 2 decimal places', () => {
      const dec = productService.toDecimal(19.99);
      expect(dec).toBeInstanceOf(Prisma.Decimal);
      expect(dec.toFixed(2)).toBe('19.99');
    });

    it('should throw BadRequestError on negative price', () => {
      expect(() => productService.toDecimal(-5)).toThrow(BadRequestError);
    });

    it('should throw BadRequestError on non-numeric input', () => {
      expect(() => productService.toDecimal('invalid-price')).toThrow(BadRequestError);
    });
  });

  describe('createProduct with initial variant', () => {
    it('should create product and initial variant transactionally with normalized uppercase SKU', async () => {
      vi.mocked(mockCategoryRepo.findById).mockResolvedValue(sampleCategory as any);
      vi.mocked(mockProductRepo.findBySlug).mockResolvedValue(null);
      vi.mocked(mockProductRepo.findVariantBySku).mockResolvedValue(null);
      vi.mocked(mockProductRepo.findVariantByBarcode).mockResolvedValue(null);
      vi.mocked(mockProductRepo.create).mockResolvedValue(sampleProduct as any);
      vi.mocked(mockProductRepo.createVariant).mockResolvedValue(sampleVariant as any);
      vi.mocked(mockProductRepo.findById).mockResolvedValue(sampleProduct as any);

      const result = await productService.createProduct({
        name: 'Artisan Roast Coffee',
        categoryId: sampleCategory.id,
        initialVariant: {
          name: 'Standard 250g',
          sku: 'coffee-250g', // Lowercase input
          price: 14.99,
          barcode: '8901234567890',
        },
      });

      expect(mockProductRepo.findVariantBySku).toHaveBeenCalledWith('COFFEE-250G');
      expect(result.id).toBe(sampleProduct.id);
      expect(result.variants?.[0]?.sku).toBe('COFFEE-250G');
      expect(result.variants?.[0]?.price).toBe('14.99');
    });

    it('should throw ConflictError if product slug already exists', async () => {
      vi.mocked(mockCategoryRepo.findById).mockResolvedValue(sampleCategory as any);
      vi.mocked(mockProductRepo.findBySlug).mockResolvedValue(sampleProduct as any);

      await expect(
        productService.createProduct({
          name: 'Artisan Roast Coffee',
          categoryId: sampleCategory.id,
        })
      ).rejects.toThrow(ConflictError);
    });

    it('should throw BadRequestError if category is not active', async () => {
      vi.mocked(mockCategoryRepo.findById).mockResolvedValue({
        ...sampleCategory,
        status: 'INACTIVE',
      } as any);

      await expect(
        productService.createProduct({
          name: 'Coffee',
          categoryId: sampleCategory.id,
        })
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('createVariant', () => {
    it('should throw ConflictError if SKU already exists', async () => {
      vi.mocked(mockProductRepo.findById).mockResolvedValue(sampleProduct as any);
      vi.mocked(mockProductRepo.findVariantBySku).mockResolvedValue(sampleVariant as any);

      await expect(
        productService.createVariant(sampleProduct.id, {
          name: 'Duplicate SKU Variant',
          sku: 'COFFEE-250G',
          price: 14.99,
        })
      ).rejects.toThrow(ConflictError);
    });

    it('should throw BadRequestError when attempting to add variant to an ARCHIVED product', async () => {
      vi.mocked(mockProductRepo.findById).mockResolvedValue({
        ...sampleProduct,
        status: 'ARCHIVED',
      } as any);

      await expect(
        productService.createVariant(sampleProduct.id, {
          name: 'New Variant',
          sku: 'NEW-SKU-001',
          price: 19.99,
        })
      ).rejects.toThrow(BadRequestError);
    });
  });
});
