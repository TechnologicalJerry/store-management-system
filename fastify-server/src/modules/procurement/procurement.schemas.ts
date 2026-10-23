import type { FastifySchema } from 'fastify';
import { z } from 'zod';

// ==============================================================================
// Zod Runtime Validation Schemas
// ==============================================================================

export const createPurchaseOrderItemZodSchema = z.object({
  variantId: z.string().uuid(),
  supplierProductId: z.string().uuid().optional(),
  quantityOrdered: z
    .union([z.number().positive(), z.string().regex(/^\d+(\.\d{1,4})?$/)])
    .refine(val => Number(val) > 0, { message: 'Ordered quantity must be positive' }),
  unitPrice: z
    .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,2})?$/)])
    .refine(val => Number(val) >= 0, { message: 'Unit price must be non-negative' })
    .optional(),
  discountAmount: z
    .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,2})?$/)])
    .refine(val => Number(val) >= 0, { message: 'Discount amount must be non-negative' })
    .default(0),
  taxRate: z
    .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,4})?$/)])
    .refine(val => Number(val) >= 0, { message: 'Tax rate must be non-negative' })
    .default(0),
});

export const createPurchaseOrderZodSchema = z.object({
  supplierId: z.string().uuid(),
  destinationStoreId: z.string().uuid(),
  currencyCode: z.string().trim().length(3).default('USD'),
  shippingTotal: z
    .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,2})?$/)])
    .refine(val => Number(val) >= 0, { message: 'Shipping total must be non-negative' })
    .default(0),
  expectedDeliveryAt: z.string().datetime().optional(),
  notes: z.string().max(2000).optional(),
  items: z.array(createPurchaseOrderItemZodSchema).min(1, 'Order must contain at least one line item'),
});

export const updatePurchaseOrderZodSchema = z.object({
  shippingTotal: z
    .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,2})?$/)])
    .refine(val => Number(val) >= 0, { message: 'Shipping total must be non-negative' })
    .optional(),
  expectedDeliveryAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  items: z.array(createPurchaseOrderItemZodSchema).min(1).optional(),
});

export const purchaseOrderQueryZodSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  supplierId: z.string().uuid().optional(),
  destinationStoreId: z.string().uuid().optional(),
  status: z
    .enum([
      'DRAFT',
      'PENDING_APPROVAL',
      'APPROVED',
      'ORDERED',
      'PARTIALLY_RECEIVED',
      'RECEIVED',
      'CANCELLED',
    ])
    .optional(),
  search: z.string().trim().optional(),
  fromOrderedAt: z.string().datetime().optional(),
  toOrderedAt: z.string().datetime().optional(),
  sortBy: z.enum(['createdAt', 'orderedAt', 'expectedDeliveryAt', 'grandTotal', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const approvePurchaseOrderZodSchema = z.object({
  notes: z.string().max(500).optional(),
});

export const cancelPurchaseOrderZodSchema = z.object({
  reason: z.string().trim().min(3, 'Cancellation reason must be provided').max(255),
});

export const createGoodsReceiptItemZodSchema = z
  .object({
    purchaseOrderItemId: z.string().uuid(),
    quantityDelivered: z
      .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,4})?$/)])
      .refine(val => Number(val) >= 0, { message: 'Delivered quantity must be non-negative' }),
    quantityAccepted: z
      .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,4})?$/)])
      .refine(val => Number(val) >= 0, { message: 'Accepted quantity must be non-negative' }),
    quantityRejected: z
      .union([z.number().nonnegative(), z.string().regex(/^\d+(\.\d{1,4})?$/)])
      .refine(val => Number(val) >= 0, { message: 'Rejected quantity must be non-negative' })
      .default(0),
    rejectionReason: z.string().max(255).optional(),
  })
  .refine(
    data => {
      const delivered = Number(data.quantityDelivered);
      const accepted = Number(data.quantityAccepted);
      const rejected = Number(data.quantityRejected);
      return Math.abs(delivered - (accepted + rejected)) < 0.0001;
    },
    { message: 'Quantity accepted plus rejected must equal delivered quantity' }
  )
  .refine(
    data => {
      const rejected = Number(data.quantityRejected);
      if (rejected > 0 && (!data.rejectionReason || data.rejectionReason.trim().length === 0)) {
        return false;
      }
      return true;
    },
    { message: 'A rejection reason is required whenever items are rejected or damaged' }
  );

export const createGoodsReceiptZodSchema = z.object({
  deliveryReference: z.string().trim().max(100).optional(),
  notes: z.string().max(2000).optional(),
  idempotencyKey: z.string().trim().max(100).optional(),
  items: z.array(createGoodsReceiptItemZodSchema).min(1, 'Receipt must contain at least one item'),
});

export const goodsReceiptQueryZodSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  purchaseOrderId: z.string().uuid().optional(),
  destinationStoreId: z.string().uuid().optional(),
});

// ==============================================================================
// OpenAPI / Fastify Route Schemas
// ==============================================================================

const poItemResponseJsonSchema = {
  type: 'object',
  required: [
    'id',
    'purchaseOrderId',
    'variantId',
    'skuSnapshot',
    'productNameSnapshot',
    'quantityOrdered',
    'quantityReceived',
    'quantityOutstanding',
    'unitPrice',
    'discountAmount',
    'taxRate',
    'lineTotal',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    purchaseOrderId: { type: 'string', format: 'uuid' },
    variantId: { type: 'string', format: 'uuid' },
    supplierProductId: { type: 'string', format: 'uuid', nullable: true },
    skuSnapshot: { type: 'string' },
    productNameSnapshot: { type: 'string' },
    supplierSkuSnapshot: { type: 'string', nullable: true },
    quantityOrdered: { type: 'string', example: '100.0000' },
    quantityReceived: { type: 'string', example: '50.0000' },
    quantityOutstanding: { type: 'string', example: '50.0000' },
    unitPrice: { type: 'string', example: '25.00' },
    discountAmount: { type: 'string', example: '0.00' },
    taxRate: { type: 'string', example: '0.0500' },
    lineTotal: { type: 'string', example: '2625.00' },
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
      },
    },
  },
};

const poResponseJsonSchema = {
  type: 'object',
  required: [
    'id',
    'purchaseOrderNumber',
    'supplierId',
    'destinationStoreId',
    'status',
    'currencyCode',
    'subtotal',
    'discountTotal',
    'taxTotal',
    'shippingTotal',
    'grandTotal',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    purchaseOrderNumber: { type: 'string', example: 'PO-1001' },
    supplierId: { type: 'string', format: 'uuid' },
    destinationStoreId: { type: 'string', format: 'uuid' },
    status: {
      type: 'string',
      enum: [
        'DRAFT',
        'PENDING_APPROVAL',
        'APPROVED',
        'ORDERED',
        'PARTIALLY_RECEIVED',
        'RECEIVED',
        'CANCELLED',
      ],
    },
    currencyCode: { type: 'string', example: 'USD' },
    subtotal: { type: 'string', example: '2500.00' },
    discountTotal: { type: 'string', example: '0.00' },
    taxTotal: { type: 'string', example: '125.00' },
    shippingTotal: { type: 'string', example: '50.00' },
    grandTotal: { type: 'string', example: '2675.00' },
    notes: { type: 'string', nullable: true },
    createdByUserId: { type: 'string', format: 'uuid', nullable: true },
    approvedByUserId: { type: 'string', format: 'uuid', nullable: true },
    approvedAt: { type: 'string', format: 'date-time', nullable: true },
    orderedAt: { type: 'string', format: 'date-time', nullable: true },
    expectedDeliveryAt: { type: 'string', format: 'date-time', nullable: true },
    cancelledAt: { type: 'string', format: 'date-time', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    supplier: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        code: { type: 'string' },
        status: { type: 'string' },
        email: { type: 'string', nullable: true },
      },
    },
    destinationStore: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        code: { type: 'string' },
        status: { type: 'string' },
      },
    },
    items: {
      type: 'array',
      items: poItemResponseJsonSchema,
    },
    statusHistory: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          fromStatus: { type: 'string' },
          toStatus: { type: 'string' },
          changedByUserId: { type: 'string', format: 'uuid', nullable: true },
          reason: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
    },
    goodsReceiptsCount: { type: 'integer', example: 1 },
  },
};

const goodsReceiptItemResponseJsonSchema = {
  type: 'object',
  required: [
    'id',
    'goodsReceiptId',
    'purchaseOrderItemId',
    'variantId',
    'quantityDelivered',
    'quantityAccepted',
    'quantityRejected',
    'createdAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    goodsReceiptId: { type: 'string', format: 'uuid' },
    purchaseOrderItemId: { type: 'string', format: 'uuid' },
    variantId: { type: 'string', format: 'uuid' },
    quantityDelivered: { type: 'string', example: '50.0000' },
    quantityAccepted: { type: 'string', example: '48.0000' },
    quantityRejected: { type: 'string', example: '2.0000' },
    rejectionReason: { type: 'string', nullable: true, example: 'Damaged packaging' },
    createdAt: { type: 'string', format: 'date-time' },
    variant: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string' },
        sku: { type: 'string' },
        barcode: { type: 'string', nullable: true },
      },
    },
  },
};

const goodsReceiptResponseJsonSchema = {
  type: 'object',
  required: [
    'id',
    'receiptNumber',
    'purchaseOrderId',
    'destinationStoreId',
    'status',
    'receivedAt',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    receiptNumber: { type: 'string', example: 'GR-1001' },
    purchaseOrderId: { type: 'string', format: 'uuid' },
    destinationStoreId: { type: 'string', format: 'uuid' },
    status: { type: 'string', enum: ['COMPLETED', 'CANCELLED'] },
    receivedByUserId: { type: 'string', format: 'uuid', nullable: true },
    receivedAt: { type: 'string', format: 'date-time' },
    deliveryReference: { type: 'string', nullable: true },
    notes: { type: 'string', nullable: true },
    idempotencyKey: { type: 'string', nullable: true },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    items: {
      type: 'array',
      items: goodsReceiptItemResponseJsonSchema,
    },
    purchaseOrder: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        purchaseOrderNumber: { type: 'string' },
        status: { type: 'string' },
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

export const createPurchaseOrderSchema: FastifySchema = {
  tags: ['Procurement'],
  summary: 'Create a new purchase order in DRAFT status',
  description: 'Initiates a new purchase order with line items, calculating totals via exact decimal arithmetic.',
  security: [{ bearerAuth: [] }],
  response: {
    201: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: poResponseJsonSchema,
      },
    },
  },
};

export const listPurchaseOrdersSchema: FastifySchema = {
  tags: ['Procurement'],
  summary: 'List purchase orders with pagination and filtering',
  description: 'Returns paginated purchase orders with optional filtering by status, supplier, destination store, and search.',
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: poResponseJsonSchema,
        },
        meta: paginationMetaSchema,
      },
    },
  },
};

export const getPurchaseOrderByIdSchema: FastifySchema = {
  tags: ['Procurement'],
  summary: 'Get purchase order details by ID',
  description: 'Retrieves complete order details including lines, snapshots, status audit history, and receipts.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['purchaseOrderId'],
    properties: {
      purchaseOrderId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: poResponseJsonSchema,
      },
    },
  },
};

export const updatePurchaseOrderSchema: FastifySchema = {
  tags: ['Procurement'],
  summary: 'Update draft purchase order',
  description: 'Modifies line items, shipping, or notes of a purchase order in DRAFT status.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['purchaseOrderId'],
    properties: {
      purchaseOrderId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: poResponseJsonSchema,
      },
    },
  },
};

export const submitPurchaseOrderSchema: FastifySchema = {
  tags: ['Procurement'],
  summary: 'Submit purchase order for approval',
  description: 'Transitions purchase order from DRAFT to PENDING_APPROVAL.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['purchaseOrderId'],
    properties: {
      purchaseOrderId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: poResponseJsonSchema,
      },
    },
  },
};

export const approvePurchaseOrderSchema: FastifySchema = {
  tags: ['Procurement'],
  summary: 'Approve purchase order',
  description: 'Approves purchase order (PENDING_APPROVAL -> APPROVED). Enforces separation of duties.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['purchaseOrderId'],
    properties: {
      purchaseOrderId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: poResponseJsonSchema,
      },
    },
  },
};

export const orderPurchaseOrderSchema: FastifySchema = {
  tags: ['Procurement'],
  summary: 'Mark purchase order as ordered/placed with vendor',
  description: 'Transitions purchase order from APPROVED to ORDERED and sets ordered timestamp.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['purchaseOrderId'],
    properties: {
      purchaseOrderId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: poResponseJsonSchema,
      },
    },
  },
};

export const cancelPurchaseOrderSchema: FastifySchema = {
  tags: ['Procurement'],
  summary: 'Cancel purchase order',
  description: 'Cancels purchase order if no goods have been received. Requires cancellation reason.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['purchaseOrderId'],
    properties: {
      purchaseOrderId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: poResponseJsonSchema,
      },
    },
  },
};

export const createGoodsReceiptSchema: FastifySchema = {
  tags: ['Procurement'],
  summary: 'Receive physical delivery against purchase order',
  description: 'Records delivery of goods, updates PO received quantities, transitions PO state, and increments store inventory with row-level locks.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['purchaseOrderId'],
    properties: {
      purchaseOrderId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: goodsReceiptResponseJsonSchema,
      },
    },
  },
};

export const listGoodsReceiptsSchema: FastifySchema = {
  tags: ['Procurement'],
  summary: 'List goods receipts for a purchase order',
  description: 'Returns historical deliveries recorded against a specific purchase order.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['purchaseOrderId'],
    properties: {
      purchaseOrderId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'array',
          items: goodsReceiptResponseJsonSchema,
        },
        meta: paginationMetaSchema,
      },
    },
  },
};

export const getGoodsReceiptByIdSchema: FastifySchema = {
  tags: ['Procurement'],
  summary: 'Get goods receipt details by ID',
  description: 'Retrieves complete delivery record with accepted and rejected line items.',
  security: [{ bearerAuth: [] }],
  params: {
    type: 'object',
    required: ['goodsReceiptId'],
    properties: {
      goodsReceiptId: { type: 'string', format: 'uuid' },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: goodsReceiptResponseJsonSchema,
      },
    },
  },
};
