import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { SaleService } from './sale.service.js';
import { CheckoutService } from './checkout.service.js';
import { ReceiptService } from './receipt.service.js';
import { PaymentService } from '../payments/payment.service.js';
import {
  createSaleSchema,
  directCheckoutSchema,
  cancelSaleSchema,
  saleQuerySchema,
  saleIdParamsSchema,
} from './sale.schemas.js';
import { recordPaymentSchema } from '../payments/payment.schemas.js';
import { requirePermissions, requireStoreAccess } from '../../plugins/authorization.js';

export const saleRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const saleService = new SaleService(app.prisma);
  const checkoutService = new CheckoutService(app.prisma);
  const receiptService = new ReceiptService(app.prisma);
  const paymentService = new PaymentService(app.prisma);

  /**
   * POST /sales
   * Creates a new draft sale with server-side pricing snapshots.
   */
  app.post(
    '/',
    {
      preHandler: [
        requireStoreAccess('sales:create', req => (req.body as any)?.storeId),
      ],
      schema: {
        description: 'Create a draft sale record with authoritative pricing calculations',
        tags: ['Sales'],
        body: {
          type: 'object',
          required: ['storeId', 'items'],
          properties: {
            storeId: { type: 'string', format: 'uuid' },
            currencyCode: { type: 'string', minLength: 3, maxLength: 3, default: 'USD' },
            notes: { type: 'string' },
            idempotencyKey: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['variantId', 'quantity'],
                properties: {
                  variantId: { type: 'string', format: 'uuid' },
                  quantity: { type: 'string' },
                  discountAmount: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = createSaleSchema.parse(request.body);
      const sale = await saleService.createSale(request.user!.id, body);
      return reply.code(201).send({
        success: true,
        data: sale,
      });
    }
  );

  /**
   * GET /sales
   * Lists sales with store-level and date filters.
   */
  app.get(
    '/',
    {
      preHandler: [requirePermissions('sales:read')],
      schema: {
        description: 'List sales matching filtering criteria',
        tags: ['Sales'],
        querystring: {
          type: 'object',
          properties: {
            storeId: { type: 'string', format: 'uuid' },
            status: { type: 'string' },
            cashierUserId: { type: 'string', format: 'uuid' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            search: { type: 'string' },
            page: { type: 'integer', default: 1 },
            limit: { type: 'integer', default: 20 },
          },
        },
      },
    },
    async (request, reply) => {
      const query = saleQuerySchema.parse(request.query);
      const result = await saleService.listSales(query);
      return reply.code(200).send({
        success: true,
        data: result.items,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    }
  );

  /**
   * GET /sales/:saleId
   * Retrieves sale details by ID.
   */
  app.get(
    '/:saleId',
    {
      preHandler: [requirePermissions('sales:read')],
      schema: {
        description: 'Retrieve detailed sale transaction record by ID',
        tags: ['Sales'],
        params: {
          type: 'object',
          required: ['saleId'],
          properties: {
            saleId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { saleId } = saleIdParamsSchema.parse(request.params);
      const sale = await saleService.getSaleById(saleId);
      return reply.code(200).send({
        success: true,
        data: sale,
      });
    }
  );

  /**
   * POST /sales/checkout
   * Executes atomic direct checkout: validates cart, calculates totals, deducts inventory,
   * settles payment, and issues customer receipt.
   */
  app.post(
    '/checkout',
    {
      preHandler: [
        requireStoreAccess('sales:checkout', req => (req.body as any)?.storeId),
      ],
      schema: {
        description: 'Process an atomic point-of-sale checkout with inventory deduction and payment',
        tags: ['Sales'],
        body: {
          type: 'object',
          required: ['storeId', 'items', 'paymentMethod'],
          properties: {
            storeId: { type: 'string', format: 'uuid' },
            paymentMethod: { type: 'string', enum: ['CASH', 'CARD', 'EXTERNAL_DIGITAL', 'STORE_CREDIT'] },
            amountTendered: { type: 'string' },
            currencyCode: { type: 'string', minLength: 3, maxLength: 3, default: 'USD' },
            notes: { type: 'string' },
            idempotencyKey: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                required: ['variantId', 'quantity'],
                properties: {
                  variantId: { type: 'string', format: 'uuid' },
                  quantity: { type: 'string' },
                  discountAmount: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = directCheckoutSchema.parse(request.body);
      const completedSale = await checkoutService.processDirectCheckout(request.user!.id, body);
      return reply.code(201).send({
        success: true,
        data: completedSale,
      });
    }
  );

  /**
   * POST /sales/:saleId/cancel
   * Cancels an uncompleted sale and releases stock reservations if any.
   */
  app.post(
    '/:saleId/cancel',
    {
      preHandler: [requirePermissions('sales:cancel')],
      schema: {
        description: 'Cancel an in-progress sale transaction',
        tags: ['Sales'],
        params: {
          type: 'object',
          required: ['saleId'],
          properties: {
            saleId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['reason'],
          properties: {
            reason: { type: 'string', minLength: 3, maxLength: 255 },
          },
        },
      },
    },
    async (request, reply) => {
      const { saleId } = saleIdParamsSchema.parse(request.params);
      const body = cancelSaleSchema.parse(request.body);
      const cancelled = await saleService.cancelSale(saleId, request.user!.id, body.reason);
      return reply.code(200).send({
        success: true,
        data: cancelled,
      });
    }
  );

  /**
   * GET /sales/:saleId/receipt
   * Retrieves the immutable customer receipt for a completed sale.
   */
  app.get(
    '/:saleId/receipt',
    {
      preHandler: [requirePermissions('receipts:read')],
      schema: {
        description: 'Retrieve the customer receipt for a completed sale',
        tags: ['Sales'],
        params: {
          type: 'object',
          required: ['saleId'],
          properties: {
            saleId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { saleId } = saleIdParamsSchema.parse(request.params);
      const receipt = await receiptService.getReceiptBySaleId(saleId);
      return reply.code(200).send({
        success: true,
        data: receipt,
      });
    }
  );

  /**
   * POST /sales/:saleId/payments
   * Records or initiates a payment attempt on an existing sale.
   */
  app.post(
    '/:saleId/payments',
    {
      preHandler: [requirePermissions('payments:record_cash', 'payments:initiate')],
      schema: {
        description: 'Record or initiate a payment on an existing sale',
        tags: ['Sales'],
        params: {
          type: 'object',
          required: ['saleId'],
          properties: {
            saleId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['paymentMethod', 'amount'],
          properties: {
            paymentMethod: { type: 'string', enum: ['CASH', 'CARD', 'EXTERNAL_DIGITAL', 'STORE_CREDIT'] },
            amount: { type: 'string' },
            currencyCode: { type: 'string', minLength: 3, maxLength: 3 },
            amountTendered: { type: 'string' },
            provider: { type: 'string' },
            providerTransactionId: { type: 'string' },
            idempotencyKey: { type: 'string' },
            notes: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { saleId } = saleIdParamsSchema.parse(request.params);
      const body = recordPaymentSchema.parse(request.body);
      const payment = await paymentService.recordOrInitiatePayment(
        saleId,
        request.user!.id,
        {
          saleId,
          ...body,
        }
      );
      return reply.code(201).send({
        success: true,
        data: payment,
      });
    }
  );

  /**
   * GET /sales/:saleId/payments
   * Lists all payments recorded for a sale.
   */
  app.get(
    '/:saleId/payments',
    {
      preHandler: [requirePermissions('payments:read')],
      schema: {
        description: 'List all payments associated with a sale',
        tags: ['Sales'],
        params: {
          type: 'object',
          required: ['saleId'],
          properties: {
            saleId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { saleId } = saleIdParamsSchema.parse(request.params);
      const payments = await paymentService.listPaymentsBySaleId(saleId);
      return reply.code(200).send({
        success: true,
        data: payments,
      });
    }
  );
};
