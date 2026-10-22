import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { InventoryRepository } from './inventory.repository.js';
import { InventoryTransferService } from './inventory-transfer.service.js';
import { requirePermissions, requireTransferStoreAccess } from '../../plugins/authorization.js';
import {
  approveTransferSchema,
  cancelTransferSchema,
  createTransferSchema,
  createTransferZodSchema,
  getTransferByIdSchema,
  getTransfersSchema,
  receiveTransferSchema,
  receiveTransferZodSchema,
  shipTransferSchema,
  shipTransferZodSchema,
  submitTransferSchema,
} from './inventory.schemas.js';
import type {
  CreateTransferDto,
  ReceiveTransferDto,
  ShipTransferDto,
  TransferQueryDto,
} from './inventory.types.js';

/**
 * Inter-Store Inventory Transfer Routes (/api/v1/inventory-transfers)
 */
export const inventoryTransferRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const repository = new InventoryRepository(app.prisma);
  const transferService = new InventoryTransferService(app.prisma, repository);

  // 1. POST / - Create transfer in DRAFT
  app.post(
    '/',
    {
      schema: createTransferSchema,
      preHandler: [
        app.authenticate,
        requireTransferStoreAccess('inventory_transfers:create', req => ({
          sourceStoreId: (req.body as any)?.sourceStoreId,
        })),
      ],
    },
    async (request, reply) => {
      const body = createTransferZodSchema.parse(request.body) as CreateTransferDto;
      const transfer = await transferService.createTransfer(body, request.user?.id);
      return reply.status(201).send({
        statusCode: 201,
        transfer,
      });
    }
  );

  // 2. GET / - List transfers with filters and pagination
  app.get(
    '/',
    {
      schema: getTransfersSchema,
      preHandler: [app.authenticate, requirePermissions('inventory_transfers:read')],
    },
    async (request, reply) => {
      const query = request.query as TransferQueryDto;
      const result = await transferService.listTransfers(query);
      return reply.status(200).send({
        statusCode: 200,
        items: result.items,
        pagination: result.pagination,
      });
    }
  );

  // 3. GET /:transferId - Get transfer details by ID
  app.get(
    '/:transferId',
    {
      schema: getTransferByIdSchema,
      preHandler: [app.authenticate, requirePermissions('inventory_transfers:read')],
    },
    async (request, reply) => {
      const { transferId } = request.params as { transferId: string };
      const transfer = await transferService.getTransferById(transferId);
      return reply.status(200).send({
        statusCode: 200,
        transfer,
      });
    }
  );

  // 4. PATCH /:transferId/submit - Submit transfer for review
  app.patch(
    '/:transferId/submit',
    {
      schema: submitTransferSchema,
      preHandler: [app.authenticate, requirePermissions('inventory_transfers:create')],
    },
    async (request, reply) => {
      const { transferId } = request.params as { transferId: string };
      const transfer = await transferService.submitTransfer(transferId);
      return reply.status(200).send({
        statusCode: 200,
        transfer,
      });
    }
  );

  // 5. PATCH /:transferId/approve - Approve transfer request
  app.patch(
    '/:transferId/approve',
    {
      schema: approveTransferSchema,
      preHandler: [app.authenticate, requirePermissions('inventory_transfers:approve')],
    },
    async (request, reply) => {
      const { transferId } = request.params as { transferId: string };
      const transfer = await transferService.approveTransfer(transferId, request.user?.id);
      return reply.status(200).send({
        statusCode: 200,
        transfer,
      });
    }
  );

  // 6. PATCH /:transferId/ship - Ship transfer and deduct source stock
  app.patch(
    '/:transferId/ship',
    {
      schema: shipTransferSchema,
      preHandler: [app.authenticate, requirePermissions('inventory_transfers:ship')],
    },
    async (request, reply) => {
      const { transferId } = request.params as { transferId: string };
      const body = request.body ? (shipTransferZodSchema.parse(request.body) as ShipTransferDto) : undefined;
      const transfer = await transferService.shipTransfer(transferId, body, request.user?.id);
      return reply.status(200).send({
        statusCode: 200,
        transfer,
      });
    }
  );

  // 7. PATCH /:transferId/receive - Receive transfer and credit destination stock
  app.patch(
    '/:transferId/receive',
    {
      schema: receiveTransferSchema,
      preHandler: [app.authenticate, requirePermissions('inventory_transfers:receive')],
    },
    async (request, reply) => {
      const { transferId } = request.params as { transferId: string };
      const body = request.body ? (receiveTransferZodSchema.parse(request.body) as ReceiveTransferDto) : undefined;
      const transfer = await transferService.receiveTransfer(transferId, body, request.user?.id);
      return reply.status(200).send({
        statusCode: 200,
        transfer,
      });
    }
  );

  // 8. PATCH /:transferId/cancel - Cancel unshipped transfer
  app.patch(
    '/:transferId/cancel',
    {
      schema: cancelTransferSchema,
      preHandler: [app.authenticate, requirePermissions('inventory_transfers:cancel')],
    },
    async (request, reply) => {
      const { transferId } = request.params as { transferId: string };
      const transfer = await transferService.cancelTransfer(transferId, request.user?.id);
      return reply.status(200).send({
        statusCode: 200,
        transfer,
      });
    }
  );
};
