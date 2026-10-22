import type { FastifySchema } from 'fastify';
import { z } from 'zod';

// ==============================================================================
// Zod Runtime Validation Schemas
// ==============================================================================

export const receiveStockZodSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z
    .union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,4})?$/)])
    .refine(val => Number(val) > 0, { message: 'Quantity must be positive' }),
  reason: z.string().max(255).optional(),
  notes: z.string().optional(),
  referenceType: z.string().max(50).optional(),
  referenceId: z.string().max(100).optional(),
  idempotencyKey: z.string().max(100).optional(),
});

export const adjustStockZodSchema = z.object({
  variantId: z.string().uuid(),
  adjustmentType: z.enum(['INCREASE', 'DECREASE']),
  quantity: z
    .union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,4})?$/)])
    .refine(val => Number(val) > 0, { message: 'Quantity must be positive' }),
  reason: z.string().min(1, 'Reason is mandatory for inventory adjustments').max(255),
  notes: z.string().optional(),
  idempotencyKey: z.string().max(100).optional(),
});

export const createReservationZodSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z
    .union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,4})?$/)])
    .refine(val => Number(val) > 0, { message: 'Quantity must be positive' }),
  referenceType: z.string().max(50).optional(),
  referenceId: z.string().max(100).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const createTransferItemZodSchema = z.object({
  variantId: z.string().uuid(),
  quantityRequested: z
    .union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,4})?$/)])
    .refine(val => Number(val) > 0, { message: 'Requested quantity must be positive' }),
  notes: z.string().max(255).optional(),
});

export const createTransferZodSchema = z
  .object({
    sourceStoreId: z.string().uuid(),
    destinationStoreId: z.string().uuid(),
    notes: z.string().optional(),
    items: z.array(createTransferItemZodSchema).min(1, 'Transfer must include at least one item'),
  })
  .refine(data => data.sourceStoreId !== data.destinationStoreId, {
    message: 'Source and destination stores must be different',
    path: ['destinationStoreId'],
  });

export const shipTransferZodSchema = z.object({
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantityShipped: z
          .union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,4})?$/)])
          .refine(val => Number(val) > 0, { message: 'Shipped quantity must be positive' }),
      })
    )
    .optional(),
});

export const receiveTransferZodSchema = z.object({
  notes: z.string().optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantityReceived: z
          .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,4})?$/)])
          .refine(val => Number(val) >= 0, { message: 'Received quantity must be non-negative' }),
        notes: z.string().max(255).optional(),
      })
    )
    .optional(),
});

// ==============================================================================
// OpenAPI / Fastify JSON Response Schemas
// ==============================================================================

const inventoryBalanceResponseSchema = {
  type: 'object',
  required: [
    'id',
    'storeId',
    'variantId',
    'quantityOnHand',
    'quantityReserved',
    'quantityAvailable',
    'reorderLevel',
    'isLowStock',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    storeId: { type: 'string', format: 'uuid' },
    variantId: { type: 'string', format: 'uuid' },
    quantityOnHand: { type: 'string', example: '150.0000' },
    quantityReserved: { type: 'string', example: '10.0000' },
    quantityAvailable: { type: 'string', example: '140.0000' },
    reorderLevel: { type: 'string', example: '25.0000' },
    isLowStock: { type: 'boolean', example: false },
    store: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        code: { type: 'string' },
      },
    },
    variant: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        productId: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        sku: { type: 'string' },
        barcode: { type: 'string', nullable: true },
        price: { type: 'string' },
        product: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            slug: { type: 'string' },
          },
        },
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const inventoryMovementResponseSchema = {
  type: 'object',
  required: [
    'id',
    'storeId',
    'variantId',
    'movementType',
    'quantityDelta',
    'quantityBefore',
    'quantityAfter',
    'createdAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    storeId: { type: 'string', format: 'uuid' },
    variantId: { type: 'string', format: 'uuid' },
    movementType: {
      type: 'string',
      enum: [
        'OPENING_STOCK',
        'STOCK_RECEIVED',
        'ADJUSTMENT_INCREASE',
        'ADJUSTMENT_DECREASE',
        'SALE',
        'RETURN',
        'TRANSFER_OUT',
        'TRANSFER_IN',
        'RESERVATION_CREATED',
        'RESERVATION_RELEASED',
        'RESERVATION_FULFILLED',
      ],
    },
    quantityDelta: { type: 'string', example: '+25.0000' },
    quantityBefore: { type: 'string', example: '100.0000' },
    quantityAfter: { type: 'string', example: '125.0000' },
    referenceType: { type: 'string', nullable: true },
    referenceId: { type: 'string', nullable: true },
    idempotencyKey: { type: 'string', nullable: true },
    reason: { type: 'string', nullable: true },
    notes: { type: 'string', nullable: true },
    performedByUserId: { type: 'string', format: 'uuid', nullable: true },
    performedByUser: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        email: { type: 'string' },
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const stockReservationResponseSchema = {
  type: 'object',
  required: ['id', 'storeId', 'variantId', 'quantity', 'status', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    storeId: { type: 'string', format: 'uuid' },
    variantId: { type: 'string', format: 'uuid' },
    quantity: { type: 'string', example: '5.0000' },
    status: { type: 'string', enum: ['ACTIVE', 'RELEASED', 'FULFILLED', 'EXPIRED', 'CANCELLED'] },
    referenceType: { type: 'string', nullable: true },
    referenceId: { type: 'string', nullable: true },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
    createdByUserId: { type: 'string', format: 'uuid', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const transferItemResponseSchema = {
  type: 'object',
  required: ['id', 'transferId', 'variantId', 'quantityRequested', 'quantityShipped', 'quantityReceived', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    transferId: { type: 'string', format: 'uuid' },
    variantId: { type: 'string', format: 'uuid' },
    quantityRequested: { type: 'string', example: '50.0000' },
    quantityShipped: { type: 'string', example: '50.0000' },
    quantityReceived: { type: 'string', example: '50.0000' },
    notes: { type: 'string', nullable: true },
    variant: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        productId: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        sku: { type: 'string' },
        barcode: { type: 'string', nullable: true },
      },
    },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const inventoryTransferResponseSchema = {
  type: 'object',
  required: ['id', 'transferNumber', 'sourceStoreId', 'destinationStoreId', 'status', 'items', 'createdAt', 'updatedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    transferNumber: { type: 'string', example: 'TRF-20261022-0001' },
    sourceStoreId: { type: 'string', format: 'uuid' },
    destinationStoreId: { type: 'string', format: 'uuid' },
    status: {
      type: 'string',
      enum: ['DRAFT', 'REQUESTED', 'APPROVED', 'SHIPPED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'],
    },
    notes: { type: 'string', nullable: true },
    sourceStore: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        code: { type: 'string' },
      },
    },
    destinationStore: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        code: { type: 'string' },
      },
    },
    items: {
      type: 'array',
      items: transferItemResponseSchema,
    },
    createdByUserId: { type: 'string', format: 'uuid', nullable: true },
    approvedByUserId: { type: 'string', format: 'uuid', nullable: true },
    shippedByUserId: { type: 'string', format: 'uuid', nullable: true },
    receivedByUserId: { type: 'string', format: 'uuid', nullable: true },
    shippedAt: { type: 'string', format: 'date-time', nullable: true },
    receivedAt: { type: 'string', format: 'date-time', nullable: true },
    cancelledAt: { type: 'string', format: 'date-time', nullable: true },
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

// ==============================================================================
// Store Inventory Route Schemas
// ==============================================================================

export const getStoreInventorySchema: FastifySchema = {
  tags: ['Inventory'],
  summary: 'List store inventory balances',
  description: 'Returns paginated inventory balances for a specific store with optional low-stock or category filtering.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['storeId'],
    properties: {
      storeId: { type: 'string', format: 'uuid' },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      search: { type: 'string', maxLength: 100 },
      categoryId: { type: 'string', format: 'uuid' },
      lowStockOnly: { type: 'boolean', default: false },
    },
  },
  response: {
    200: {
      description: 'Paginated inventory balances.',
      type: 'object',
      required: ['statusCode', 'items', 'pagination'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        items: {
          type: 'array',
          items: inventoryBalanceResponseSchema,
        },
        pagination: paginationMetaSchema,
      },
    },
  },
};

export const getStoreLowStockSchema: FastifySchema = {
  tags: ['Inventory'],
  summary: 'List low-stock inventory items',
  description: 'Retrieves all inventory items where quantity on hand is less than or equal to reorder level.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['storeId'],
    properties: {
      storeId: { type: 'string', format: 'uuid' },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      categoryId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'Low-stock inventory balances.',
      type: 'object',
      required: ['statusCode', 'items', 'pagination'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        items: {
          type: 'array',
          items: inventoryBalanceResponseSchema,
        },
        pagination: paginationMetaSchema,
      },
    },
  },
};

export const getVariantBalanceSchema: FastifySchema = {
  tags: ['Inventory'],
  summary: 'Get variant inventory balance for a store',
  description: 'Retrieves current on-hand, reserved, and available stock for a specific SKU/variant at a store.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['storeId', 'variantId'],
    properties: {
      storeId: { type: 'string', format: 'uuid' },
      variantId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'Inventory balance details.',
      type: 'object',
      required: ['statusCode', 'balance'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        balance: inventoryBalanceResponseSchema,
      },
    },
  },
};

export const getStoreMovementsSchema: FastifySchema = {
  tags: ['Inventory'],
  summary: 'List inventory movement ledger for a store',
  description: 'Retrieves paginated audit trail of all inventory movements with filters by variant or movement type.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['storeId'],
    properties: {
      storeId: { type: 'string', format: 'uuid' },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      variantId: { type: 'string', format: 'uuid' },
      movementType: { type: 'string' },
      referenceType: { type: 'string' },
      startDate: { type: 'string', format: 'date-time' },
      endDate: { type: 'string', format: 'date-time' },
    },
  },
  response: {
    200: {
      description: 'Paginated movement records.',
      type: 'object',
      required: ['statusCode', 'items', 'pagination'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        items: {
          type: 'array',
          items: inventoryMovementResponseSchema,
        },
        pagination: paginationMetaSchema,
      },
    },
  },
};

export const getVariantMovementsSchema: FastifySchema = {
  tags: ['Inventory'],
  summary: 'List movements for a specific variant in a store',
  description: 'Retrieves audit movement ledger entries for a single product variant at a store.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['storeId', 'variantId'],
    properties: {
      storeId: { type: 'string', format: 'uuid' },
      variantId: { type: 'string', format: 'uuid' },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
  response: {
    200: {
      description: 'Paginated variant movement records.',
      type: 'object',
      required: ['statusCode', 'items', 'pagination'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        items: {
          type: 'array',
          items: inventoryMovementResponseSchema,
        },
        pagination: paginationMetaSchema,
      },
    },
  },
};

export const receiveStockSchema: FastifySchema = {
  tags: ['Inventory'],
  summary: 'Receive stock into store inventory',
  description: 'Atomically increments stock on hand and records an immutable STOCK_RECEIVED movement with idempotency protection.',
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
    required: ['variantId', 'quantity'],
    properties: {
      variantId: { type: 'string', format: 'uuid' },
      quantity: { type: ['number', 'string'], minimum: 0.0001 },
      reason: { type: 'string', maxLength: 255 },
      notes: { type: 'string' },
      referenceType: { type: 'string', maxLength: 50 },
      referenceId: { type: 'string', maxLength: 100 },
      idempotencyKey: { type: 'string', maxLength: 100 },
    },
  },
  response: {
    201: {
      description: 'Stock successfully received.',
      type: 'object',
      required: ['statusCode', 'balance', 'movement'],
      properties: {
        statusCode: { type: 'integer', example: 201 },
        balance: inventoryBalanceResponseSchema,
        movement: inventoryMovementResponseSchema,
      },
    },
  },
};

export const adjustStockSchema: FastifySchema = {
  tags: ['Inventory'],
  summary: 'Perform manual stock adjustment',
  description: 'Manually adjusts stock with explicit increase/decrease reason, creating an auditable ledger record.',
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
    required: ['variantId', 'adjustmentType', 'quantity', 'reason'],
    properties: {
      variantId: { type: 'string', format: 'uuid' },
      adjustmentType: { type: 'string', enum: ['INCREASE', 'DECREASE'] },
      quantity: { type: ['number', 'string'], minimum: 0.0001 },
      reason: { type: 'string', minLength: 1, maxLength: 255 },
      notes: { type: 'string' },
      idempotencyKey: { type: 'string', maxLength: 100 },
    },
  },
  response: {
    200: {
      description: 'Stock successfully adjusted.',
      type: 'object',
      required: ['statusCode', 'balance', 'movement'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        balance: inventoryBalanceResponseSchema,
        movement: inventoryMovementResponseSchema,
      },
    },
  },
};

export const createReservationSchema: FastifySchema = {
  tags: ['Inventory'],
  summary: 'Reserve stock for upcoming order or checkout',
  description: 'Reserves available stock for a product variant at a store without deducting stock on hand.',
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
    required: ['variantId', 'quantity'],
    properties: {
      variantId: { type: 'string', format: 'uuid' },
      quantity: { type: ['number', 'string'], minimum: 0.0001 },
      referenceType: { type: 'string', maxLength: 50 },
      referenceId: { type: 'string', maxLength: 100 },
      expiresAt: { type: 'string', format: 'date-time' },
    },
  },
  response: {
    201: {
      description: 'Reservation successfully created.',
      type: 'object',
      required: ['statusCode', 'reservation', 'balance'],
      properties: {
        statusCode: { type: 'integer', example: 201 },
        reservation: stockReservationResponseSchema,
        balance: inventoryBalanceResponseSchema,
      },
    },
  },
};

export const releaseReservationSchema: FastifySchema = {
  tags: ['Inventory'],
  summary: 'Release an active stock reservation',
  description: 'Releases previously reserved stock, restoring available quantity.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['storeId', 'reservationId'],
    properties: {
      storeId: { type: 'string', format: 'uuid' },
      reservationId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'Reservation successfully released.',
      type: 'object',
      required: ['statusCode', 'reservation', 'balance'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        reservation: stockReservationResponseSchema,
        balance: inventoryBalanceResponseSchema,
      },
    },
  },
};

export const fulfillReservationSchema: FastifySchema = {
  tags: ['Inventory'],
  summary: 'Fulfill an active stock reservation',
  description: 'Converts reserved stock into an fulfilled sale, decrementing on-hand and reserved quantities simultaneously.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['storeId', 'reservationId'],
    properties: {
      storeId: { type: 'string', format: 'uuid' },
      reservationId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'Reservation successfully fulfilled.',
      type: 'object',
      required: ['statusCode', 'reservation', 'balance'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        reservation: stockReservationResponseSchema,
        balance: inventoryBalanceResponseSchema,
      },
    },
  },
};

// ==============================================================================
// Inventory Transfers Route Schemas
// ==============================================================================

export const createTransferSchema: FastifySchema = {
  tags: ['Inventory Transfers'],
  summary: 'Create an inter-store transfer request',
  description: 'Creates a stock transfer request in DRAFT status between two distinct stores.',
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['sourceStoreId', 'destinationStoreId', 'items'],
    properties: {
      sourceStoreId: { type: 'string', format: 'uuid' },
      destinationStoreId: { type: 'string', format: 'uuid' },
      notes: { type: 'string' },
      items: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['variantId', 'quantityRequested'],
          properties: {
            variantId: { type: 'string', format: 'uuid' },
            quantityRequested: { type: ['number', 'string'], minimum: 0.0001 },
            notes: { type: 'string', maxLength: 255 },
          },
        },
      },
    },
  },
  response: {
    201: {
      description: 'Transfer created successfully.',
      type: 'object',
      required: ['statusCode', 'transfer'],
      properties: {
        statusCode: { type: 'integer', example: 201 },
        transfer: inventoryTransferResponseSchema,
      },
    },
  },
};

export const getTransfersSchema: FastifySchema = {
  tags: ['Inventory Transfers'],
  summary: 'List stock transfers',
  description: 'Returns paginated inter-store stock transfers filtered by store or status.',
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      sourceStoreId: { type: 'string', format: 'uuid' },
      destinationStoreId: { type: 'string', format: 'uuid' },
      status: { type: 'string' },
    },
  },
  response: {
    200: {
      description: 'Paginated transfers list.',
      type: 'object',
      required: ['statusCode', 'items', 'pagination'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        items: {
          type: 'array',
          items: inventoryTransferResponseSchema,
        },
        pagination: paginationMetaSchema,
      },
    },
  },
};

export const getTransferByIdSchema: FastifySchema = {
  tags: ['Inventory Transfers'],
  summary: 'Get transfer details by ID',
  description: 'Retrieves complete details of an inter-store stock transfer including all item lines and lifecycle timestamps.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['transferId'],
    properties: {
      transferId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'Transfer details.',
      type: 'object',
      required: ['statusCode', 'transfer'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        transfer: inventoryTransferResponseSchema,
      },
    },
  },
};

export const submitTransferSchema: FastifySchema = {
  tags: ['Inventory Transfers'],
  summary: 'Submit transfer for review',
  description: 'Transitions transfer from DRAFT to REQUESTED.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['transferId'],
    properties: {
      transferId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'Transfer submitted.',
      type: 'object',
      required: ['statusCode', 'transfer'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        transfer: inventoryTransferResponseSchema,
      },
    },
  },
};

export const approveTransferSchema: FastifySchema = {
  tags: ['Inventory Transfers'],
  summary: 'Approve transfer request',
  description: 'Transitions transfer from REQUESTED to APPROVED. Requires manager permissions.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['transferId'],
    properties: {
      transferId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'Transfer approved.',
      type: 'object',
      required: ['statusCode', 'transfer'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        transfer: inventoryTransferResponseSchema,
      },
    },
  },
};

export const shipTransferSchema: FastifySchema = {
  tags: ['Inventory Transfers'],
  summary: 'Ship transfer and deduct source stock',
  description: 'Transitions transfer to SHIPPED and atomically deducts items from source store inventory.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['transferId'],
    properties: {
      transferId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['variantId', 'quantityShipped'],
          properties: {
            variantId: { type: 'string', format: 'uuid' },
            quantityShipped: { type: ['number', 'string'], minimum: 0.0001 },
          },
        },
      },
    },
  },
  response: {
    200: {
      description: 'Transfer shipped and stock deducted.',
      type: 'object',
      required: ['statusCode', 'transfer'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        transfer: inventoryTransferResponseSchema,
      },
    },
  },
};

export const receiveTransferSchema: FastifySchema = {
  tags: ['Inventory Transfers'],
  summary: 'Receive transfer items and credit destination stock',
  description: 'Confirms receipt of transfer items at destination store, incrementing stock and marking transfer RECEIVED or PARTIALLY_RECEIVED.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['transferId'],
    properties: {
      transferId: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    properties: {
      notes: { type: 'string' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          required: ['variantId', 'quantityReceived'],
          properties: {
            variantId: { type: 'string', format: 'uuid' },
            quantityReceived: { type: ['number', 'string'], minimum: 0 },
            notes: { type: 'string', maxLength: 255 },
          },
        },
      },
    },
  },
  response: {
    200: {
      description: 'Transfer received and destination stock credited.',
      type: 'object',
      required: ['statusCode', 'transfer'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        transfer: inventoryTransferResponseSchema,
      },
    },
  },
};

export const cancelTransferSchema: FastifySchema = {
  tags: ['Inventory Transfers'],
  summary: 'Cancel an unshipped transfer',
  description: 'Cancels transfer if it has not yet been shipped.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['transferId'],
    properties: {
      transferId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      description: 'Transfer cancelled.',
      type: 'object',
      required: ['statusCode', 'transfer'],
      properties: {
        statusCode: { type: 'integer', example: 200 },
        transfer: inventoryTransferResponseSchema,
      },
    },
  },
};
