import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PurchaseOrderService } from './purchase-order.service.js';
import { GoodsReceiptService } from './goods-receipt.service.js';
import { requirePermissions } from '../../plugins/authorization.js';
import {
  approvePurchaseOrderSchema,
  approvePurchaseOrderZodSchema,
  cancelPurchaseOrderSchema,
  cancelPurchaseOrderZodSchema,
  createGoodsReceiptSchema,
  createGoodsReceiptZodSchema,
  createPurchaseOrderSchema,
  createPurchaseOrderZodSchema,
  getGoodsReceiptByIdSchema,
  getPurchaseOrderByIdSchema,
  goodsReceiptQueryZodSchema,
  listGoodsReceiptsSchema,
  listPurchaseOrdersSchema,
  orderPurchaseOrderSchema,
  purchaseOrderQueryZodSchema,
  submitPurchaseOrderSchema,
  updatePurchaseOrderSchema,
  updatePurchaseOrderZodSchema,
} from './procurement.schemas.js';
import type {
  ApprovePurchaseOrderDto,
  CancelPurchaseOrderDto,
  CreateGoodsReceiptDto,
  CreatePurchaseOrderDto,
  GoodsReceiptQueryDto,
  PurchaseOrderQueryDto,
  UpdatePurchaseOrderDto,
} from './procurement.types.js';

export const procurementRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const poService = new PurchaseOrderService(app.prisma);
  const receiptService = new GoodsReceiptService(app.prisma);

  // ============================================================================
  // Purchase Order Routes
  // ============================================================================

  // 1. POST /api/v1/purchase-orders - Create purchase order in DRAFT
  app.post(
    '/',
    {
      schema: createPurchaseOrderSchema,
      preHandler: [app.authenticate, requirePermissions('purchase_orders:create')],
    },
    async (request, reply) => {
      const validatedBody = createPurchaseOrderZodSchema.parse(request.body) as CreatePurchaseOrderDto;
      const po = await poService.createPurchaseOrder(validatedBody, request.user?.id);
      return reply.status(201).send({
        success: true,
        data: po,
      });
    }
  );

  // 2. GET /api/v1/purchase-orders - List purchase orders with filters
  app.get(
    '/',
    {
      schema: listPurchaseOrdersSchema,
      preHandler: [app.authenticate, requirePermissions('purchase_orders:read')],
    },
    async (request, reply) => {
      const query = purchaseOrderQueryZodSchema.parse(request.query) as PurchaseOrderQueryDto;
      const result = await poService.listPurchaseOrders(query);
      return reply.status(200).send({
        success: true,
        data: result.items,
        meta: result.meta,
      });
    }
  );

  // 3. GET /api/v1/purchase-orders/:purchaseOrderId - Get PO detail
  app.get(
    '/:purchaseOrderId',
    {
      schema: getPurchaseOrderByIdSchema,
      preHandler: [app.authenticate, requirePermissions('purchase_orders:read')],
    },
    async (request, reply) => {
      const { purchaseOrderId } = request.params as { purchaseOrderId: string };
      const po = await poService.getPurchaseOrderById(purchaseOrderId);
      return reply.status(200).send({
        success: true,
        data: po,
      });
    }
  );

  // 4. PATCH /api/v1/purchase-orders/:purchaseOrderId - Update draft purchase order
  app.patch(
    '/:purchaseOrderId',
    {
      schema: updatePurchaseOrderSchema,
      preHandler: [app.authenticate, requirePermissions('purchase_orders:update')],
    },
    async (request, reply) => {
      const { purchaseOrderId } = request.params as { purchaseOrderId: string };
      const validatedBody = updatePurchaseOrderZodSchema.parse(request.body) as UpdatePurchaseOrderDto;
      const po = await poService.updatePurchaseOrder(purchaseOrderId, validatedBody, request.user?.id);
      return reply.status(200).send({
        success: true,
        data: po,
      });
    }
  );

  // 5. POST /api/v1/purchase-orders/:purchaseOrderId/submit - Submit for approval
  app.post(
    '/:purchaseOrderId/submit',
    {
      schema: submitPurchaseOrderSchema,
      preHandler: [app.authenticate, requirePermissions('purchase_orders:update')],
    },
    async (request, reply) => {
      const { purchaseOrderId } = request.params as { purchaseOrderId: string };
      const po = await poService.submitForApproval(purchaseOrderId, request.user?.id);
      return reply.status(200).send({
        success: true,
        data: po,
      });
    }
  );

  // 6. POST /api/v1/purchase-orders/:purchaseOrderId/approve - Approve order
  app.post(
    '/:purchaseOrderId/approve',
    {
      schema: approvePurchaseOrderSchema,
      preHandler: [app.authenticate, requirePermissions('purchase_orders:approve')],
    },
    async (request, reply) => {
      const { purchaseOrderId } = request.params as { purchaseOrderId: string };
      const validatedBody = approvePurchaseOrderZodSchema.parse(request.body || {}) as ApprovePurchaseOrderDto;
      const po = await poService.approvePurchaseOrder(
        purchaseOrderId,
        validatedBody,
        request.user?.id,
        request.user?.roles || []
      );
      return reply.status(200).send({
        success: true,
        data: po,
      });
    }
  );

  // 7. POST /api/v1/purchase-orders/:purchaseOrderId/order - Transmit to vendor
  app.post(
    '/:purchaseOrderId/order',
    {
      schema: orderPurchaseOrderSchema,
      preHandler: [app.authenticate, requirePermissions('purchase_orders:update')],
    },
    async (request, reply) => {
      const { purchaseOrderId } = request.params as { purchaseOrderId: string };
      const po = await poService.markOrdered(purchaseOrderId, request.user?.id);
      return reply.status(200).send({
        success: true,
        data: po,
      });
    }
  );

  // 8. POST /api/v1/purchase-orders/:purchaseOrderId/cancel - Cancel order
  app.post(
    '/:purchaseOrderId/cancel',
    {
      schema: cancelPurchaseOrderSchema,
      preHandler: [app.authenticate, requirePermissions('purchase_orders:cancel')],
    },
    async (request, reply) => {
      const { purchaseOrderId } = request.params as { purchaseOrderId: string };
      const validatedBody = cancelPurchaseOrderZodSchema.parse(request.body) as CancelPurchaseOrderDto;
      const po = await poService.cancelPurchaseOrder(purchaseOrderId, validatedBody, request.user?.id);
      return reply.status(200).send({
        success: true,
        data: po,
      });
    }
  );

  // ============================================================================
  // Goods Receipt Routes
  // ============================================================================

  // 9. POST /api/v1/purchase-orders/:purchaseOrderId/receipts - Receive delivery
  app.post(
    '/:purchaseOrderId/receipts',
    {
      schema: createGoodsReceiptSchema,
      preHandler: [app.authenticate, requirePermissions('goods_receipts:create')],
    },
    async (request, reply) => {
      const { purchaseOrderId } = request.params as { purchaseOrderId: string };
      const validatedBody = createGoodsReceiptZodSchema.parse(request.body) as CreateGoodsReceiptDto;
      const receipt = await receiptService.receiveGoods(
        purchaseOrderId,
        validatedBody,
        request.user?.id
      );
      return reply.status(201).send({
        success: true,
        data: receipt,
      });
    }
  );

  // 10. GET /api/v1/purchase-orders/:purchaseOrderId/receipts - List receipts for PO
  app.get(
    '/:purchaseOrderId/receipts',
    {
      schema: listGoodsReceiptsSchema,
      preHandler: [app.authenticate, requirePermissions('goods_receipts:read')],
    },
    async (request, reply) => {
      const { purchaseOrderId } = request.params as { purchaseOrderId: string };
      const query = goodsReceiptQueryZodSchema.parse(request.query) as GoodsReceiptQueryDto;
      const result = await receiptService.listGoodsReceipts({
        ...query,
        purchaseOrderId,
      });
      return reply.status(200).send({
        success: true,
        data: result.items,
        meta: result.meta,
      });
    }
  );
};

export const goodsReceiptRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const receiptService = new GoodsReceiptService(app.prisma);

  // GET /api/v1/goods-receipts/:goodsReceiptId - Get single receipt by ID
  app.get(
    '/:goodsReceiptId',
    {
      schema: getGoodsReceiptByIdSchema,
      preHandler: [app.authenticate, requirePermissions('goods_receipts:read')],
    },
    async (request, reply) => {
      const { goodsReceiptId } = request.params as { goodsReceiptId: string };
      const receipt = await receiptService.getGoodsReceiptById(goodsReceiptId);
      return reply.status(200).send({
        success: true,
        data: receipt,
      });
    }
  );
};
