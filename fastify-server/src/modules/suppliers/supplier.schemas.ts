import type { FastifySchema } from 'fastify';
import { z } from 'zod';

// ==============================================================================
// Zod Runtime Validation Schemas
// ==============================================================================

export const createSupplierZodSchema = z.object({
  name: z.string().trim().min(2).max(150),
  code: z
    .string()
    .trim()
    .min(2)
    .max(50)
    .regex(/^[A-Za-z0-9_-]+$/, 'Code can only contain alphanumeric characters, underscores, and dashes'),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().max(50).optional(),
  website: z.string().trim().url().max(255).optional(),
  taxIdentifier: z.string().trim().max(50).optional(),
  addressLine1: z.string().trim().max(255).optional(),
  addressLine2: z.string().trim().max(255).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(30).optional(),
  countryCode: z.string().trim().length(2, 'Country code must be ISO 3166-1 alpha-2').optional(),
  notes: z.string().max(2000).optional(),
});

export const updateSupplierZodSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  email: z.string().trim().email().max(255).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  website: z.string().trim().url().max(255).nullable().optional(),
  taxIdentifier: z.string().trim().max(50).nullable().optional(),
  addressLine1: z.string().trim().max(255).nullable().optional(),
  addressLine2: z.string().trim().max(255).nullable().optional(),
  city: z.string().trim().max(100).nullable().optional(),
  state: z.string().trim().max(100).nullable().optional(),
  postalCode: z.string().trim().max(30).nullable().optional(),
  countryCode: z.string().trim().length(2).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateSupplierStatusZodSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
});

export const supplierQueryZodSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  sortBy: z.enum(['name', 'code', 'status', 'createdAt', 'updatedAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const createSupplierProductZodSchema = z.object({
  variantId: z.string().uuid(),
  supplierSku: z.string().trim().max(100).optional(),
  supplierProductName: z.string().trim().max(200).optional(),
  purchasePrice: z
    .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,2})?$/)])
    .refine(val => Number(val) >= 0, { message: 'Purchase price must be non-negative' }),
  currencyCode: z.string().trim().length(3).default('USD'),
  minimumOrderQuantity: z
    .union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,4})?$/)])
    .refine(val => Number(val) > 0, { message: 'Minimum order quantity must be greater than zero' })
    .default(1),
  leadTimeDays: z.number().int().nonnegative().optional(),
  isPreferred: z.boolean().default(false),
});

export const updateSupplierProductZodSchema = z.object({
  supplierSku: z.string().trim().max(100).nullable().optional(),
  supplierProductName: z.string().trim().max(200).nullable().optional(),
  purchasePrice: z
    .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,2})?$/)])
    .refine(val => Number(val) >= 0, { message: 'Purchase price must be non-negative' })
    .optional(),
  currencyCode: z.string().trim().length(3).optional(),
  minimumOrderQuantity: z
    .union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,4})?$/)])
    .refine(val => Number(val) > 0, { message: 'Minimum order quantity must be greater than zero' })
    .optional(),
  leadTimeDays: z.number().int().nonnegative().nullable().optional(),
  isPreferred: z.boolean().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const supplierProductQueryZodSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  isPreferred: z.coerce.boolean().optional(),
  search: z.string().trim().optional(),
});

// ==============================================================================
// OpenAPI / Fastify Route Schemas
// ==============================================================================

const supplierResponseJsonSchema = {
  type: 'object',
  required: ['id', 'name', 'code', 'status', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    name: { type: 'string', example: 'Global Electronics Distribution Inc.' },
    code: { type: 'string', example: 'SUP-ELEC-01' },
    email: { type: 'string', format: 'email', nullable: true },
    phone: { type: 'string', nullable: true },
    website: { type: 'string', nullable: true },
    taxIdentifier: { type: 'string', nullable: true },
    addressLine1: { type: 'string', nullable: true },
    addressLine2: { type: 'string', nullable: true },
    city: { type: 'string', nullable: true },
    state: { type: 'string', nullable: true },
    postalCode: { type: 'string', nullable: true },
    countryCode: { type: 'string', nullable: true },
    status: { type: 'string', enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'] },
    notes: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    productsCount: { type: 'integer', example: 12 },
  },
};

const supplierProductResponseJsonSchema = {
  type: 'object',
  required: [
    'id',
    'supplierId',
    'variantId',
    'purchasePrice',
    'currencyCode',
    'minimumOrderQuantity',
    'isPreferred',
    'status',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    supplierId: { type: 'string', format: 'uuid' },
    variantId: { type: 'string', format: 'uuid' },
    supplierSku: { type: 'string', nullable: true },
    supplierProductName: { type: 'string', nullable: true },
    purchasePrice: { type: 'string', example: '49.99' },
    currencyCode: { type: 'string', example: 'USD' },
    minimumOrderQuantity: { type: 'string', example: '10.0000' },
    leadTimeDays: { type: 'integer', nullable: true, example: 5 },
    isPreferred: { type: 'boolean', example: true },
    status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    variant: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        sku: { type: 'string' },
        barcode: { type: 'string', nullable: true },
        status: { type: 'string' },
        product: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            slug: { type: 'string' },
            status: { type: 'string' },
          },
        },
      },
    },
  },
};

const paginationMetaSchema = {
  type: 'object',
  required: ['page', 'limit', 'totalItems', 'totalPages', 'hasNextPage', 'hasPrevPage'],
  properties: {
    page: { type: 'integer' },
    limit: { type: 'integer' },
    totalItems: { type: 'integer' },
    totalPages: { type: 'integer' },
    hasNextPage: { type: 'boolean' },
    hasPrevPage: { type: 'boolean' },
  },
};

export const createSupplierSchema: FastifySchema = {
  tags: ['Suppliers'],
  summary: 'Create a new vendor/supplier',
  description: 'Registers a new supplier in the system with unique supplier code.',
  security: [{ bearerAuth: [] }],
  response: {
    201: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: supplierResponseJsonSchema,
      },
    },
  },
};

export const listSuppliersSchema: FastifySchema = {
  tags: ['Suppliers'],
  summary: 'List suppliers with pagination and filtering',
  description: 'Returns paginated suppliers with optional search by code or name and status filter.',
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: supplierResponseJsonSchema,
        },
        meta: paginationMetaSchema,
      },
    },
  },
};

export const getSupplierByIdSchema: FastifySchema = {
  tags: ['Suppliers'],
  summary: 'Get supplier details by ID',
  description: 'Retrieves complete profile for a single supplier.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['supplierId'],
    properties: {
      supplierId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: supplierResponseJsonSchema,
      },
    },
  },
};

export const updateSupplierSchema: FastifySchema = {
  tags: ['Suppliers'],
  summary: 'Update supplier information',
  description: 'Modifies contact or address information for an existing supplier.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['supplierId'],
    properties: {
      supplierId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: supplierResponseJsonSchema,
      },
    },
  },
};

export const updateSupplierStatusSchema: FastifySchema = {
  tags: ['Suppliers'],
  summary: 'Update supplier operational status',
  description: 'Transitions supplier status between ACTIVE, INACTIVE, and SUSPENDED.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['supplierId'],
    properties: {
      supplierId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: supplierResponseJsonSchema,
      },
    },
  },
};

export const deleteSupplierSchema: FastifySchema = {
  tags: ['Suppliers'],
  summary: 'Soft-delete a supplier',
  description: 'Marks a supplier as soft-deleted if no purchase orders are linked.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['supplierId'],
    properties: {
      supplierId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string' },
      },
    },
  },
};

export const listSupplierProductsSchema: FastifySchema = {
  tags: ['Suppliers'],
  summary: 'List products/variants supplied by a supplier',
  description: 'Returns products offered by this supplier with pricing, lead times, and MOQs.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['supplierId'],
    properties: {
      supplierId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: supplierProductResponseJsonSchema,
        },
        meta: paginationMetaSchema,
      },
    },
  },
};

export const addSupplierProductSchema: FastifySchema = {
  tags: ['Suppliers'],
  summary: 'Register product variant with supplier',
  description: 'Links a product variant to a supplier catalog offering with agreed pricing.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['supplierId'],
    properties: {
      supplierId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: supplierProductResponseJsonSchema,
      },
    },
  },
};

export const updateSupplierProductSchema: FastifySchema = {
  tags: ['Suppliers'],
  summary: 'Update supplier product offering details',
  description: 'Modifies pricing, MOQ, lead time, or status of a supplier product relationship.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['supplierId', 'supplierProductId'],
    properties: {
      supplierId: { type: 'string', format: 'uuid' },
      supplierProductId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: supplierProductResponseJsonSchema,
      },
    },
  },
};

export const removeSupplierProductSchema: FastifySchema = {
  tags: ['Suppliers'],
  summary: 'Remove product variant from supplier offerings',
  description: 'Unlinks product variant from supplier catalogue.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['supplierId', 'supplierProductId'],
    properties: {
      supplierId: { type: 'string', format: 'uuid' },
      supplierProductId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        message: { type: 'string' },
      },
    },
  },
};
