import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { CategoryRepository } from './category.repository.js';
import { CategoryService } from './category.service.js';
import { requirePermissions } from '../../plugins/authorization.js';
import {
  createCategorySchema,
  deleteCategorySchema,
  getCategoriesSchema,
  getCategoryByIdSchema,
  updateCategorySchema,
  updateCategoryStatusSchema,
} from './category.schemas.js';
import type {
  CategoryQueryDto,
  CreateCategoryDto,
  UpdateCategoryDto,
  UpdateCategoryStatusDto,
} from './category.types.js';

export const categoryRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const categoryRepo = new CategoryRepository(app.prisma);
  const categoryService = new CategoryService(categoryRepo);

  // 1. POST /api/v1/categories - Create category
  app.post(
    '/',
    {
      schema: createCategorySchema,
      preHandler: [app.authenticate, requirePermissions('categories:create')],
    },
    async (request, reply) => {
      const body = request.body as CreateCategoryDto;
      const category = await categoryService.createCategory(body);
      return reply.status(201).send({
        statusCode: 201,
        category,
      });
    }
  );

  // 2. GET /api/v1/categories - List categories
  app.get(
    '/',
    {
      schema: getCategoriesSchema,
      preHandler: [app.authenticate, requirePermissions('categories:read')],
    },
    async (request, reply) => {
      const query = request.query as CategoryQueryDto;
      const result = await categoryService.listCategories(query);
      return reply.status(200).send({
        statusCode: 200,
        items: result.items,
        pagination: result.pagination,
      });
    }
  );

  // 3. GET /api/v1/categories/:categoryId - Get category by ID
  app.get(
    '/:categoryId',
    {
      schema: getCategoryByIdSchema,
      preHandler: [app.authenticate, requirePermissions('categories:read')],
    },
    async (request, reply) => {
      const { categoryId } = request.params as { categoryId: string };
      const category = await categoryService.getCategoryById(categoryId);
      return reply.status(200).send({
        statusCode: 200,
        category,
      });
    }
  );

  // 4. PATCH /api/v1/categories/:categoryId - Update category
  app.patch(
    '/:categoryId',
    {
      schema: updateCategorySchema,
      preHandler: [app.authenticate, requirePermissions('categories:update')],
    },
    async (request, reply) => {
      const { categoryId } = request.params as { categoryId: string };
      const body = request.body as UpdateCategoryDto;
      const category = await categoryService.updateCategory(categoryId, body);
      return reply.status(200).send({
        statusCode: 200,
        category,
      });
    }
  );

  // 5. PATCH /api/v1/categories/:categoryId/status - Update category status
  app.patch(
    '/:categoryId/status',
    {
      schema: updateCategoryStatusSchema,
      preHandler: [app.authenticate, requirePermissions('categories:manage_status')],
    },
    async (request, reply) => {
      const { categoryId } = request.params as { categoryId: string };
      const body = request.body as UpdateCategoryStatusDto;
      const category = await categoryService.updateCategoryStatus(categoryId, body);
      return reply.status(200).send({
        statusCode: 200,
        category,
      });
    }
  );

  // 6. DELETE /api/v1/categories/:categoryId - Delete category
  app.delete(
    '/:categoryId',
    {
      schema: deleteCategorySchema,
      preHandler: [app.authenticate, requirePermissions('categories:delete')],
    },
    async (request, reply) => {
      const { categoryId } = request.params as { categoryId: string };
      await categoryService.deleteCategory(categoryId);
      return reply.status(200).send({
        statusCode: 200,
        success: true,
        message: 'Category deleted successfully.',
      });
    }
  );
};
