import type { FastifySchema } from 'fastify';

const categoryResponseSchema = {
  type: 'object',
  required: ['id', 'name', 'slug', 'status', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'Beverages' },
    slug: { type: 'string', example: 'beverages' },
    description: { type: 'string', nullable: true },
    parentId: { type: 'string', format: 'uuid', nullable: true },
    status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
    parent: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        slug: { type: 'string' },
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const paginationMetaSchema = {
  type: 'object',
  required: ['page', 'limit', 'totalItems', 'totalPages', 'hasNextPage', 'hasPrevPage'],
  properties: {
    page: { type: 'integer', example: 1 },
    limit: { type: 'integer', example: 20 },
    totalItems: { type: 'integer', example: 15 },
    totalPages: { type: 'integer', example: 1 },
    hasNextPage: { type: 'boolean', example: false },
    hasPrevPage: { type: 'boolean', example: false },
  },
};

export const createCategorySchema: FastifySchema = {
  tags: ['Categories'],
  summary: 'Create a new product category',
  description: 'Creates a top-level or hierarchical subcategory with auto-generated or custom slug.',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 100 },
      slug: { type: 'string', minLength: 2, maxLength: 120, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
      description: { type: 'string', maxLength: 500 },
      parentId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    201: {
      description: 'Category created successfully.',
      type: 'object',
      required: ['statusCode', 'category'],
      properties: {
        statusCode: { type: 'integer', example: 201 },
        category: categoryResponseSchema,
      },
    },
  },
};

export const getCategoriesSchema: FastifySchema = {
  tags: ['Categories'],
  summary: 'List product categories',
  description: 'Returns a paginated list of categories with parent hierarchy.',
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      parentId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
      search: { type: 'string', maxLength: 100 },
      sortBy: { type: 'string', enum: ['name', 'slug', 'createdAt', 'status'], default: 'name' },
      sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'asc' },
    },
  },
  response: {
    200: {
      description: 'Paginated category list.',
      type: 'object',
      required: ['statusCode', 'items', 'pagination'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        items: {
          type: 'array',
          items: categoryResponseSchema,
        },
        pagination: paginationMetaSchema,
      },
    },
  },
};

export const getCategoryByIdSchema: FastifySchema = {
  tags: ['Categories'],
  summary: 'Get category details by ID',
  description: 'Retrieves category information including parent category.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['categoryId'],
    properties: {
      categoryId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'Category details.',
      type: 'object',
      required: ['statusCode', 'category'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        category: categoryResponseSchema,
      },
    },
  },
};

export const updateCategorySchema: FastifySchema = {
  tags: ['Categories'],
  summary: 'Update category details',
  description: 'Updates category name, slug, description, or parent reference with cycle prevention.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['categoryId'],
    properties: {
      categoryId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 100 },
      slug: { type: 'string', minLength: 2, maxLength: 120, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
      description: { type: 'string', maxLength: 500 },
      parentId: { type: 'string', format: 'uuid', nullable: true },
    },
  },
  response: {
    200: {
      description: 'Category updated successfully.',
      type: 'object',
      required: ['statusCode', 'category'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        category: categoryResponseSchema,
      },
    },
  },
};

export const updateCategoryStatusSchema: FastifySchema = {
  tags: ['Categories'],
  summary: 'Change category status',
  description: 'Transitions category status between ACTIVE and INACTIVE.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['categoryId'],
    properties: {
      categoryId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
    },
  },
  response: {
    200: {
      description: 'Category status updated successfully.',
      type: 'object',
      required: ['statusCode', 'category'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        category: categoryResponseSchema,
      },
    },
  },
};

export const deleteCategorySchema: FastifySchema = {
  tags: ['Categories'],
  summary: 'Delete a category',
  description: 'Deletes a category if no products or child categories reference it.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['categoryId'],
    properties: {
      categoryId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'Category deleted successfully.',
      type: 'object',
      required: ['statusCode', 'success', 'message'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        success: { type: 'boolean', example: true },
        message: { type: 'string', example: 'Category deleted successfully.' },
      },
    },
  },
};
