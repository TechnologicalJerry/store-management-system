import type { FastifySchema } from 'fastify';

const variantResponseSchema = {
  type: 'object',
  required: [
    'id',
    'productId',
    'name',
    'sku',
    'price',
    'currency',
    'taxCategory',
    'status',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    productId: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'Default' },
    sku: { type: 'string', example: 'PROD-001-DEF' },
    barcode: { type: 'string', nullable: true, example: '8901234567890' },
    price: { type: 'string', example: '29.99' },
    costPrice: { type: 'string', nullable: true, example: '15.50' },
    currency: { type: 'string', example: 'USD' },
    taxCategory: { type: 'string', example: 'STANDARD' },
    attributes: { type: 'object', nullable: true, additionalProperties: true },
    status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'DISCONTINUED'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const productResponseSchema = {
  type: 'object',
  required: [
    'id',
    'name',
    'slug',
    'categoryId',
    'status',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'Premium Organic Coffee Beans' },
    slug: { type: 'string', example: 'premium-organic-coffee-beans' },
    description: { type: 'string', nullable: true },
    categoryId: { type: 'string', format: 'uuid' },
    brand: { type: 'string', nullable: true, example: 'Artisan Roast' },
    status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] },
    category: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        slug: { type: 'string' },
      },
    },
    variants: {
      type: 'array',
      items: variantResponseSchema,
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
    totalItems: { type: 'integer', example: 100 },
    totalPages: { type: 'integer', example: 5 },
    hasNextPage: { type: 'boolean', example: true },
    hasPrevPage: { type: 'boolean', example: false },
  },
};

export const createProductSchema: FastifySchema = {
  tags: ['Products'],
  summary: 'Create a new catalog product',
  description: 'Creates a product with metadata, category reference, and optional initial sellable variant.',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['name', 'categoryId'],
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 200 },
      slug: { type: 'string', minLength: 2, maxLength: 220, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
      description: { type: 'string' },
      categoryId: { type: 'string', format: 'uuid' },
      brand: { type: 'string', maxLength: 100 },
      status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'], default: 'DRAFT' },
      initialVariant: {
        type: 'object',
        required: ['name', 'sku', 'price'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 150 },
          sku: { type: 'string', minLength: 2, maxLength: 100 },
          barcode: { type: 'string', maxLength: 100 },
          price: { type: ['number', 'string'], minimum: 0 },
          costPrice: { type: ['number', 'string'], minimum: 0 },
          currency: { type: 'string', minLength: 3, maxLength: 3, default: 'USD' },
          taxCategory: { type: 'string', maxLength: 50, default: 'STANDARD' },
          attributes: { type: 'object', additionalProperties: true },
          status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'DISCONTINUED'], default: 'ACTIVE' },
        },
      },
    },
  },
  response: {
    201: {
      description: 'Product created successfully.',
      type: 'object',
      required: ['statusCode', 'product'],
      properties: {
        statusCode: { type: 'integer', example: 201 },
        product: productResponseSchema,
      },
    },
  },
};

export const getProductsSchema: FastifySchema = {
  tags: ['Products'],
  summary: 'List products with filtering and pagination',
  description: 'Returns paginated products filtered by category, status, brand, or text search.',
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      categoryId: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] },
      brand: { type: 'string', maxLength: 100 },
      search: { type: 'string', maxLength: 100 },
      sortBy: { type: 'string', enum: ['name', 'slug', 'createdAt', 'status'], default: 'createdAt' },
      sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
    },
  },
  response: {
    200: {
      description: 'Paginated product list.',
      type: 'object',
      required: ['statusCode', 'items', 'pagination'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        items: {
          type: 'array',
          items: productResponseSchema,
        },
        pagination: paginationMetaSchema,
      },
    },
  },
};

export const getProductByIdSchema: FastifySchema = {
  tags: ['Products'],
  summary: 'Get product details by ID',
  description: 'Retrieves complete product details including category and sellable variants.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['productId'],
    properties: {
      productId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'Product details.',
      type: 'object',
      required: ['statusCode', 'product'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        product: productResponseSchema,
      },
    },
  },
};

export const updateProductSchema: FastifySchema = {
  tags: ['Products'],
  summary: 'Update product details',
  description: 'Updates product name, slug, description, category, or brand.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['productId'],
    properties: {
      productId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 200 },
      slug: { type: 'string', minLength: 2, maxLength: 220, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
      description: { type: 'string' },
      categoryId: { type: 'string', format: 'uuid' },
      brand: { type: 'string', maxLength: 100 },
    },
  },
  response: {
    200: {
      description: 'Product updated successfully.',
      type: 'object',
      required: ['statusCode', 'product'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        product: productResponseSchema,
      },
    },
  },
};

export const updateProductStatusSchema: FastifySchema = {
  tags: ['Products'],
  summary: 'Change product status',
  description: 'Transitions product status between DRAFT, ACTIVE, and ARCHIVED.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['productId'],
    properties: {
      productId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['DRAFT', 'ACTIVE', 'ARCHIVED'] },
    },
  },
  response: {
    200: {
      description: 'Product status updated successfully.',
      type: 'object',
      required: ['statusCode', 'product'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        product: productResponseSchema,
      },
    },
  },
};

export const createVariantSchema: FastifySchema = {
  tags: ['Products'],
  summary: 'Create a variant for a product',
  description: 'Adds a new sellable SKU variant with price and barcode to an existing product.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['productId'],
    properties: {
      productId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['name', 'sku', 'price'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 150 },
      sku: { type: 'string', minLength: 2, maxLength: 100 },
      barcode: { type: 'string', maxLength: 100 },
      price: { type: ['number', 'string'], minimum: 0 },
      costPrice: { type: ['number', 'string'], minimum: 0 },
      currency: { type: 'string', minLength: 3, maxLength: 3, default: 'USD' },
      taxCategory: { type: 'string', maxLength: 50, default: 'STANDARD' },
      attributes: { type: 'object', additionalProperties: true },
      status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'DISCONTINUED'], default: 'ACTIVE' },
    },
  },
  response: {
    201: {
      description: 'Variant created successfully.',
      type: 'object',
      required: ['statusCode', 'variant'],
      properties: {
        statusCode: { type: 'integer', example: 201 },
        variant: variantResponseSchema,
      },
    },
  },
};

export const getVariantsByProductSchema: FastifySchema = {
  tags: ['Products'],
  summary: 'List variants for a product',
  description: 'Retrieves all sellable variants of a specific product.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['productId'],
    properties: {
      productId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'List of variants.',
      type: 'object',
      required: ['statusCode', 'variants'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        variants: {
          type: 'array',
          items: variantResponseSchema,
        },
      },
    },
  },
};

export const getVariantByIdSchema: FastifySchema = {
  tags: ['Products'],
  summary: 'Get variant details by ID',
  description: 'Retrieves metadata, SKU, barcode, and pricing for a specific variant.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['variantId'],
    properties: {
      variantId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'Variant details.',
      type: 'object',
      required: ['statusCode', 'variant'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        variant: variantResponseSchema,
      },
    },
  },
};

export const updateVariantSchema: FastifySchema = {
  tags: ['Products'],
  summary: 'Update variant details and pricing',
  description: 'Updates variant name, SKU, barcode, price, cost price, or attributes.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['variantId'],
    properties: {
      variantId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 150 },
      sku: { type: 'string', minLength: 2, maxLength: 100 },
      barcode: { type: 'string', maxLength: 100, nullable: true },
      price: { type: ['number', 'string'], minimum: 0 },
      costPrice: { type: ['number', 'string'], minimum: 0, nullable: true },
      currency: { type: 'string', minLength: 3, maxLength: 3 },
      taxCategory: { type: 'string', maxLength: 50 },
      attributes: { type: 'object', additionalProperties: true },
    },
  },
  response: {
    200: {
      description: 'Variant updated successfully.',
      type: 'object',
      required: ['statusCode', 'variant'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        variant: variantResponseSchema,
      },
    },
  },
};

export const updateVariantStatusSchema: FastifySchema = {
  tags: ['Products'],
  summary: 'Change variant status',
  description: 'Transitions variant status between ACTIVE, INACTIVE, and DISCONTINUED.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['variantId'],
    properties: {
      variantId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'DISCONTINUED'] },
    },
  },
  response: {
    200: {
      description: 'Variant status updated successfully.',
      type: 'object',
      required: ['statusCode', 'variant'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        variant: variantResponseSchema,
      },
    },
  },
};
