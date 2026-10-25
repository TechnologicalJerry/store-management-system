import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ReportService } from './report.service.js';
import {
  salesSummaryQuerySchema,
  topProductsQuerySchema,
  paymentSummaryQuerySchema,
  inventorySummaryQuerySchema,
  lowStockQuerySchema,
  procurementSummaryQuerySchema,
  asyncReportRequestSchema,
  reportIdParamsSchema,
} from './report.schemas.js';
import { requireStoreAccess, requirePermissions } from '../../plugins/authorization.js';

export const reportRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const reportService = new ReportService(app.prisma);

  /**
   * GET /reports/sales-summary
   * Compiles gross sales, discounts, refunds, net sales, and day-by-day intervals.
   */
  app.get(
    '/sales-summary',
    {
      preHandler: [
        requireStoreAccess('reports:read', req => (req.query as Record<string, string>)?.storeId),
      ],
      schema: {
        description: 'Retrieve sales summary metrics and daily series for a store and date range',
        tags: ['Reports & Analytics'],
        querystring: {
          type: 'object',
          required: ['storeId'],
          properties: {
            storeId: { type: 'string', format: 'uuid' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            groupBy: { type: 'string', enum: ['day', 'week', 'month'], default: 'day' },
          },
        },
      },
    },
    async (request, reply) => {
      const query = salesSummaryQuerySchema.parse(request.query);
      const data = await reportService.getSalesSummary(query);
      return reply.code(200).send({ success: true, data });
    }
  );

  /**
   * GET /reports/top-products
   * Retrieves top-selling products and variants by quantity sold and gross revenue.
   */
  app.get(
    '/top-products',
    {
      preHandler: [
        requireStoreAccess('reports:read', req => (req.query as Record<string, string>)?.storeId),
      ],
      schema: {
        description: 'Retrieve top-selling products and variants for a store',
        tags: ['Reports & Analytics'],
        querystring: {
          type: 'object',
          required: ['storeId'],
          properties: {
            storeId: { type: 'string', format: 'uuid' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          },
        },
      },
    },
    async (request, reply) => {
      const query = topProductsQuerySchema.parse(request.query);
      const data = await reportService.getTopProducts(query);
      return reply.code(200).send({ success: true, data });
    }
  );

  /**
   * GET /reports/payments
   * Compiles payment totals by method, status, refunds, and reconciliation totals.
   */
  app.get(
    '/payments',
    {
      preHandler: [
        requireStoreAccess('reports:read', req => (req.query as Record<string, string>)?.storeId),
      ],
      schema: {
        description: 'Retrieve payment breakdown by method, capture totals, and refund counts',
        tags: ['Reports & Analytics'],
        querystring: {
          type: 'object',
          required: ['storeId'],
          properties: {
            storeId: { type: 'string', format: 'uuid' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            paymentMethod: {
              type: 'string',
              enum: ['CASH', 'CARD', 'EXTERNAL_DIGITAL', 'STORE_CREDIT'],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const query = paymentSummaryQuerySchema.parse(request.query);
      const data = await reportService.getPaymentSummary(query);
      return reply.code(200).send({ success: true, data });
    }
  );

  /**
   * GET /reports/inventory
   * Retrieves store inventory balances, reserved stock, available quantity, and valuation.
   */
  app.get(
    '/inventory',
    {
      preHandler: [
        requireStoreAccess('reports:read', req => (req.query as Record<string, string>)?.storeId),
      ],
      schema: {
        description: 'Retrieve store inventory valuation, total on-hand, and reserved stock balances',
        tags: ['Reports & Analytics'],
        querystring: {
          type: 'object',
          required: ['storeId'],
          properties: {
            storeId: { type: 'string', format: 'uuid' },
            categoryId: { type: 'string', format: 'uuid' },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const query = inventorySummaryQuerySchema.parse(request.query);
      const data = await reportService.getInventorySummary(query);
      return reply.code(200).send({ success: true, data });
    }
  );

  /**
   * GET /reports/low-stock
   * Lists variants whose available quantity is at or below the reorder point.
   */
  app.get(
    '/low-stock',
    {
      preHandler: [
        requireStoreAccess('reports:read', req => (req.query as Record<string, string>)?.storeId),
      ],
      schema: {
        description: 'Retrieve low-stock items at or below reorder threshold',
        tags: ['Reports & Analytics'],
        querystring: {
          type: 'object',
          required: ['storeId'],
          properties: {
            storeId: { type: 'string', format: 'uuid' },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const query = lowStockQuerySchema.parse(request.query);
      const data = await reportService.getLowStockItems(query);
      return reply.code(200).send({ success: true, data });
    }
  );

  /**
   * GET /reports/procurement
   * Summarizes purchase order statuses, ordered vs received quantities, and supplier totals.
   */
  app.get(
    '/procurement',
    {
      preHandler: [
        requireStoreAccess('reports:read', req => (req.query as Record<string, string>)?.storeId),
      ],
      schema: {
        description: 'Retrieve procurement summary, PO statuses, and supplier purchasing totals',
        tags: ['Reports & Analytics'],
        querystring: {
          type: 'object',
          required: ['storeId'],
          properties: {
            storeId: { type: 'string', format: 'uuid' },
            startDate: { type: 'string', format: 'date-time' },
            endDate: { type: 'string', format: 'date-time' },
            supplierId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const query = procurementSummaryQuerySchema.parse(request.query);
      const data = await reportService.getProcurementSummary(query);
      return reply.code(200).send({ success: true, data });
    }
  );

  /**
   * POST /reports/async
   * Enqueues an asynchronous report generation job for large date intervals.
   */
  app.post(
    '/async',
    {
      preHandler: [
        requireStoreAccess('reports:export', req => (req.body as Record<string, string>)?.storeId),
      ],
      schema: {
        description: 'Enqueue asynchronous report generation for multi-month or heavy date intervals',
        tags: ['Reports & Analytics'],
        body: {
          type: 'object',
          required: ['storeId', 'reportType'],
          properties: {
            storeId: { type: 'string', format: 'uuid' },
            reportType: {
              type: 'string',
              enum: [
                'SALES_SUMMARY',
                'TOP_PRODUCTS',
                'PAYMENT_SUMMARY',
                'INVENTORY_SUMMARY',
                'LOW_STOCK',
                'PROCUREMENT_SUMMARY',
              ],
            },
            parameters: { type: 'object' },
          },
        },
      },
    },
    async (request, reply) => {
      const input = asyncReportRequestSchema.parse(request.body);
      const userId = request.user?.id ?? 'system';
      const result = await reportService.requestAsyncReport(input, userId);
      return reply.code(202).send({
        success: true,
        message: 'Report generation queued successfully',
        data: result,
      });
    }
  );

  /**
   * GET /reports/async/:id
   * Polls status and fetches generated report results.
   */
  app.get(
    '/async/:id',
    {
      preHandler: [requirePermissions('reports:read')],
      schema: {
        description: 'Check status and download completed asynchronous report result payload',
        tags: ['Reports & Analytics'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = reportIdParamsSchema.parse(request.params);
      const isGlobalAdmin =
        request.user?.roles.includes('SUPER_ADMIN') || request.user?.roles.includes('ADMIN');

      // If not global admin, filter by user store memberships
      let authorizedStoreIds: string[] | undefined;
      if (!isGlobalAdmin) {
        const memberships = await app.prisma.storeMembership.findMany({
          where: { userId: request.user?.id, status: 'ACTIVE' },
          select: { storeId: true },
        });
        authorizedStoreIds = memberships.map(m => m.storeId);
      }

      const report = await reportService.getAsyncReportStatus(id, authorizedStoreIds);
      return reply.code(200).send({ success: true, data: report });
    }
  );
};
