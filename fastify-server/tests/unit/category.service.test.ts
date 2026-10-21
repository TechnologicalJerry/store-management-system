import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategoryService } from '../../src/modules/categories/category.service.js';
import type { CategoryRepository } from '../../src/modules/categories/category.repository.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../src/common/errors/app-error.js';

describe('CategoryService (Unit)', () => {
  let mockCategoryRepo: CategoryRepository;
  let categoryService: CategoryService;

  const mockDate = new Date('2026-10-21T10:00:00Z');
  const sampleCategory = {
    id: 'cat-uuid-1',
    name: 'Beverages',
    slug: 'beverages',
    description: 'Refreshing drinks',
    parentId: null,
    status: 'ACTIVE' as const,
    createdAt: mockDate,
    updatedAt: mockDate,
    parent: null,
  };

  const sampleSubcategory = {
    id: 'cat-uuid-2',
    name: 'Hot Drinks',
    slug: 'hot-drinks',
    description: 'Teas and Coffees',
    parentId: 'cat-uuid-1',
    status: 'ACTIVE' as const,
    createdAt: mockDate,
    updatedAt: mockDate,
    parent: {
      id: 'cat-uuid-1',
      name: 'Beverages',
      slug: 'beverages',
    },
  };

  beforeEach(() => {
    mockCategoryRepo = {
      findById: vi.fn(),
      findBySlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      countProductsInCategory: vi.fn(),
      countChildren: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    } as unknown as CategoryRepository;

    categoryService = new CategoryService(mockCategoryRepo);
  });

  describe('slugify', () => {
    it('should convert mixed-case strings to lowercase dashed slugs', () => {
      expect(categoryService.slugify('Organic Fresh Fruits & Vegetables!')).toBe(
        'organic-fresh-fruits-vegetables'
      );
      expect(categoryService.slugify('   Coffee & Tea   ')).toBe('coffee-tea');
    });
  });

  describe('createCategory', () => {
    it('should generate slug from name if slug is not provided', async () => {
      vi.mocked(mockCategoryRepo.findBySlug).mockResolvedValue(null);
      vi.mocked(mockCategoryRepo.create).mockResolvedValue(sampleCategory);

      const result = await categoryService.createCategory({
        name: 'Beverages',
      });

      expect(mockCategoryRepo.findBySlug).toHaveBeenCalledWith('beverages');
      expect(result.slug).toBe('beverages');
    });

    it('should throw ConflictError if slug already exists', async () => {
      vi.mocked(mockCategoryRepo.findBySlug).mockResolvedValue(sampleCategory);

      await expect(
        categoryService.createCategory({
          name: 'Beverages',
          slug: 'beverages',
        })
      ).rejects.toThrow(ConflictError);
    });

    it('should throw BadRequestError if parent category is inactive', async () => {
      vi.mocked(mockCategoryRepo.findBySlug).mockResolvedValue(null);
      vi.mocked(mockCategoryRepo.findById).mockResolvedValue({
        ...sampleCategory,
        status: 'INACTIVE',
      });

      await expect(
        categoryService.createCategory({
          name: 'Cold Drinks',
          parentId: sampleCategory.id,
        })
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('updateCategory hierarchy checks', () => {
    it('should throw BadRequestError if category is set as its own parent', async () => {
      vi.mocked(mockCategoryRepo.findById).mockResolvedValue(sampleCategory);

      await expect(
        categoryService.updateCategory(sampleCategory.id, {
          parentId: sampleCategory.id,
        })
      ).rejects.toThrow(BadRequestError);
    });

    it('should throw BadRequestError if a circular hierarchy is detected', async () => {
      // Setup hierarchy: Cat A -> Cat B -> Cat C
      // Attempt to set Cat A's parent to Cat C, creating a loop!
      const catA = { ...sampleCategory, id: 'cat-A', parentId: null };
      const catB = { ...sampleCategory, id: 'cat-B', parentId: 'cat-A' };
      const catC = { ...sampleCategory, id: 'cat-C', parentId: 'cat-B' };

      vi.mocked(mockCategoryRepo.findById).mockImplementation(async (id: string) => {
        if (id === 'cat-A') return catA;
        if (id === 'cat-B') return catB;
        if (id === 'cat-C') return catC;
        return null;
      });

      await expect(
        categoryService.updateCategory('cat-A', {
          parentId: 'cat-C',
        })
      ).rejects.toThrow(/Circular category hierarchy detected/);
    });
  });

  describe('deleteCategory safeguards', () => {
    it('should throw ConflictError when category has assigned products', async () => {
      vi.mocked(mockCategoryRepo.findById).mockResolvedValue(sampleCategory);
      vi.mocked(mockCategoryRepo.countProductsInCategory).mockResolvedValue(5); // 5 products exist

      await expect(categoryService.deleteCategory(sampleCategory.id)).rejects.toThrow(
        ConflictError
      );
    });

    it('should throw ConflictError when category has subcategories', async () => {
      vi.mocked(mockCategoryRepo.findById).mockResolvedValue(sampleCategory);
      vi.mocked(mockCategoryRepo.countProductsInCategory).mockResolvedValue(0);
      vi.mocked(mockCategoryRepo.countChildren).mockResolvedValue(2); // 2 subcategories exist

      await expect(categoryService.deleteCategory(sampleCategory.id)).rejects.toThrow(
        ConflictError
      );
    });

    it('should delete category when clean without products or children', async () => {
      vi.mocked(mockCategoryRepo.findById).mockResolvedValue(sampleCategory);
      vi.mocked(mockCategoryRepo.countProductsInCategory).mockResolvedValue(0);
      vi.mocked(mockCategoryRepo.countChildren).mockResolvedValue(0);
      vi.mocked(mockCategoryRepo.delete).mockResolvedValue(sampleCategory);

      await expect(categoryService.deleteCategory(sampleCategory.id)).resolves.toBeUndefined();
      expect(mockCategoryRepo.delete).toHaveBeenCalledWith(sampleCategory.id);
    });
  });
});
