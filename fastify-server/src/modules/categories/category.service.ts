import type { ProductCategory } from '@prisma/client';
import type { CategoryRepository } from './category.repository.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../common/errors/app-error.js';
import { buildPaginatedResponse, parsePagination } from '../../common/utils/pagination.js';
import type {
  CategoryQueryDto,
  CategoryResponseDto,
  CategoryStatus,
  CreateCategoryDto,
  PaginatedCategoriesResponse,
  UpdateCategoryDto,
  UpdateCategoryStatusDto,
} from './category.types.js';

export class CategoryService {
  constructor(private readonly categoryRepo: CategoryRepository) {}

  public slugify(name: string): string {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  public formatCategory(
    category: ProductCategory & {
      parent?: { id: string; name: string; slug: string } | null;
    }
  ): CategoryResponseDto {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      parentId: category.parentId,
      status: category.status as CategoryStatus,
      parent: category.parent ?? null,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  public async createCategory(input: CreateCategoryDto): Promise<CategoryResponseDto> {
    const slug = (input.slug ? this.slugify(input.slug) : this.slugify(input.name)) || 'category';

    // Verify slug uniqueness
    const existing = await this.categoryRepo.findBySlug(slug);
    if (existing) {
      throw new ConflictError(`Category with slug '${slug}' already exists.`);
    }

    // Verify parent category if supplied
    if (input.parentId) {
      const parent = await this.categoryRepo.findById(input.parentId);
      if (!parent) {
        throw new NotFoundError(`Parent category with ID '${input.parentId}' not found.`);
      }
      if (parent.status !== 'ACTIVE') {
        throw new BadRequestError(`Cannot assign an inactive parent category.`);
      }
    }

    const category = await this.categoryRepo.create({
      name: input.name.trim(),
      slug,
      description: input.description?.trim(),
      ...(input.parentId ? { parent: { connect: { id: input.parentId } } } : {}),
      status: 'ACTIVE',
    });

    return this.formatCategory(category);
  }

  public async getCategoryById(categoryId: string): Promise<CategoryResponseDto> {
    const category = await this.categoryRepo.findById(categoryId);
    if (!category) {
      throw new NotFoundError(`Category with ID '${categoryId}' not found.`);
    }
    return this.formatCategory(category);
  }

  public async listCategories(query: CategoryQueryDto): Promise<PaginatedCategoriesResponse> {
    const { page, limit, skip, take, sortBy, sortOrder } = parsePagination(query, {
      defaultLimit: 20,
      defaultSortBy: 'name',
      defaultSortOrder: 'asc',
    });

    const [categories, totalItems] = await Promise.all([
      this.categoryRepo.findMany({
        skip,
        take,
        parentId: query.parentId,
        status: query.status,
        search: query.search?.trim(),
        sortBy,
        sortOrder,
      }),
      this.categoryRepo.count({
        parentId: query.parentId,
        status: query.status,
        search: query.search?.trim(),
      }),
    ]);

    const formatted = categories.map(c => this.formatCategory(c));
    return buildPaginatedResponse(formatted, totalItems, page, limit);
  }

  public async updateCategory(
    categoryId: string,
    input: UpdateCategoryDto
  ): Promise<CategoryResponseDto> {
    const existing = await this.categoryRepo.findById(categoryId);
    if (!existing) {
      throw new NotFoundError(`Category with ID '${categoryId}' not found.`);
    }

    // Verify slug uniqueness if slug changed
    let updatedSlug: string | undefined;
    if (input.slug !== undefined) {
      const candidateSlug = this.slugify(input.slug);
      if (candidateSlug !== existing.slug) {
        const slugExists = await this.categoryRepo.findBySlug(candidateSlug);
        if (slugExists) {
          throw new ConflictError(`Category with slug '${candidateSlug}' already exists.`);
        }
        updatedSlug = candidateSlug;
      }
    }

    // Hierarchy cycle and parent check
    if (input.parentId !== undefined) {
      if (input.parentId === categoryId) {
        throw new BadRequestError('A category cannot be its own parent.');
      }

      if (input.parentId !== null) {
        const parent = await this.categoryRepo.findById(input.parentId);
        if (!parent) {
          throw new NotFoundError(`Parent category with ID '${input.parentId}' not found.`);
        }
        if (parent.status !== 'ACTIVE') {
          throw new BadRequestError(`Cannot assign an inactive parent category.`);
        }

        // Circular hierarchy check: traverse upward from new parent to ensure categoryId is not in the chain
        let currentParentId: string | null = parent.parentId;
        while (currentParentId) {
          if (currentParentId === categoryId) {
            throw new BadRequestError('Circular category hierarchy detected: A category cannot be its own ancestor.');
          }
          const ancestor = await this.categoryRepo.findById(currentParentId);
          currentParentId = ancestor?.parentId ?? null;
        }
      }
    }

    const updated = await this.categoryRepo.update(categoryId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(updatedSlug !== undefined ? { slug: updatedSlug } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.parentId !== undefined
        ? input.parentId === null
          ? { parent: { disconnect: true } }
          : { parent: { connect: { id: input.parentId } } }
        : {}),
    });

    return this.formatCategory(updated);
  }

  public async updateCategoryStatus(
    categoryId: string,
    input: UpdateCategoryStatusDto
  ): Promise<CategoryResponseDto> {
    const existing = await this.categoryRepo.findById(categoryId);
    if (!existing) {
      throw new NotFoundError(`Category with ID '${categoryId}' not found.`);
    }

    const updated = await this.categoryRepo.update(categoryId, {
      status: input.status,
    });

    return this.formatCategory(updated);
  }

  public async deleteCategory(categoryId: string): Promise<void> {
    const existing = await this.categoryRepo.findById(categoryId);
    if (!existing) {
      throw new NotFoundError(`Category with ID '${categoryId}' not found.`);
    }

    // Check if products reference this category
    const productCount = await this.categoryRepo.countProductsInCategory(categoryId);
    if (productCount > 0) {
      throw new ConflictError(
        `Cannot delete category because ${productCount} product(s) are currently assigned to it. Reassign products first.`
      );
    }

    // Check if subcategories exist
    const childrenCount = await this.categoryRepo.countChildren(categoryId);
    if (childrenCount > 0) {
      throw new ConflictError(
        `Cannot delete category because it has ${childrenCount} subcategory/subcategories. Remove or reassign subcategories first.`
      );
    }

    await this.categoryRepo.delete(categoryId);
  }
}
