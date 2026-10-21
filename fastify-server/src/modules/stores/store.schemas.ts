import type { FastifySchema } from 'fastify';

const storeResponseSchema = {
  type: 'object',
  required: [
    'id',
    'name',
    'code',
    'timezone',
    'status',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'Downtown Flagship Store' },
    code: { type: 'string', example: 'STORE-001' },
    description: { type: 'string', nullable: true },
    email: { type: 'string', format: 'email', nullable: true },
    phone: { type: 'string', nullable: true },
    addressLine1: { type: 'string', nullable: true },
    addressLine2: { type: 'string', nullable: true },
    city: { type: 'string', nullable: true },
    state: { type: 'string', nullable: true },
    postalCode: { type: 'string', nullable: true },
    countryCode: { type: 'string', nullable: true },
    timezone: { type: 'string', example: 'America/New_York' },
    status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] },
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
    totalItems: { type: 'integer', example: 45 },
    totalPages: { type: 'integer', example: 3 },
    hasNextPage: { type: 'boolean', example: true },
    hasPrevPage: { type: 'boolean', example: false },
  },
};

export const createStoreSchema: FastifySchema = {
  tags: ['Stores'],
  summary: 'Create a new retail store or branch',
  description: 'Creates a new store location with unique store code. Requires store creation permissions.',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['name', 'code'],
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 150 },
      code: { type: 'string', minLength: 2, maxLength: 50, pattern: '^[a-zA-Z0-9_-]+$' },
      description: { type: 'string', maxLength: 500 },
      email: { type: 'string', format: 'email', maxLength: 255 },
      phone: { type: 'string', maxLength: 50 },
      addressLine1: { type: 'string', maxLength: 255 },
      addressLine2: { type: 'string', maxLength: 255 },
      city: { type: 'string', maxLength: 100 },
      state: { type: 'string', maxLength: 100 },
      postalCode: { type: 'string', maxLength: 30 },
      countryCode: { type: 'string', maxLength: 10 },
      timezone: { type: 'string', maxLength: 50, default: 'UTC' },
    },
  },
  response: {
    201: {
      description: 'Store created successfully.',
      type: 'object',
      required: ['statusCode', 'store'],
      properties: {
        statusCode: { type: 'integer', example: 201 },
        store: storeResponseSchema,
      },
    },
  },
};

export const getStoresSchema: FastifySchema = {
  tags: ['Stores'],
  summary: 'List stores with filtering and pagination',
  description: 'Returns a paginated list of retail store branches.',
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] },
      search: { type: 'string', maxLength: 100 },
      sortBy: { type: 'string', enum: ['name', 'code', 'createdAt', 'status'], default: 'createdAt' },
      sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
    },
  },
  response: {
    200: {
      description: 'Paginated list of stores.',
      type: 'object',
      required: ['statusCode', 'items', 'pagination'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        items: {
          type: 'array',
          items: storeResponseSchema,
        },
        pagination: paginationMetaSchema,
      },
    },
  },
};

export const getStoreByIdSchema: FastifySchema = {
  tags: ['Stores'],
  summary: 'Get store details by ID',
  description: 'Retrieves complete metadata for a specific store branch.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['storeId'],
    properties: {
      storeId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'Store details.',
      type: 'object',
      required: ['statusCode', 'store'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        store: storeResponseSchema,
      },
    },
  },
};

export const updateStoreSchema: FastifySchema = {
  tags: ['Stores'],
  summary: 'Update store metadata',
  description: 'Updates details of an existing store location.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['storeId'],
    properties: {
      storeId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 150 },
      description: { type: 'string', maxLength: 500 },
      email: { type: 'string', format: 'email', maxLength: 255 },
      phone: { type: 'string', maxLength: 50 },
      addressLine1: { type: 'string', maxLength: 255 },
      addressLine2: { type: 'string', maxLength: 255 },
      city: { type: 'string', maxLength: 100 },
      state: { type: 'string', maxLength: 100 },
      postalCode: { type: 'string', maxLength: 30 },
      countryCode: { type: 'string', maxLength: 10 },
      timezone: { type: 'string', maxLength: 50 },
    },
  },
  response: {
    200: {
      description: 'Store updated successfully.',
      type: 'object',
      required: ['statusCode', 'store'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        store: storeResponseSchema,
      },
    },
  },
};

export const updateStoreStatusSchema: FastifySchema = {
  tags: ['Stores'],
  summary: 'Change store operational status',
  description: 'Transitions store status between ACTIVE, INACTIVE, and SUSPENDED.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['storeId'],
    properties: {
      storeId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] },
    },
  },
  response: {
    200: {
      description: 'Store status updated successfully.',
      type: 'object',
      required: ['statusCode', 'store'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        store: storeResponseSchema,
      },
    },
  },
};
