import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { InventoryRepository } from './inventory.repository.js';
import { InventoryService } from './inventory.service.js';
import { InventoryReservationService } from './inventory-reservation.service.js';
import { requireStoreAccess } from '../../plugins/authorization.js';
import {
  adjustStockSchema,
  adjustStockZodSchema,
  createReservationSchema,
  createReservationZodSchema,
  fulfillReservationSchema,
  getStoreInventorySchema,
  getStoreLowStockSchema,
  getStoreMovementsSchema,
  getVariantBalanceSchema,
  getVariantMovementsSchema,
  receiveStockSchema,
  receiveStockZodSchema,
  releaseReservationSchema,
} from './inventory.schemas.js';
import type {
  AdjustStockDto,
  CreateReservationDto,
  InventoryQueryDto,
  LowStockQueryDto,
  MovementQueryDto,
  ReceiveStockDto,
} from './inventory.types.js';

/**
 * Store-Scoped Inventory Routes (/api/v1/stores/:storeId/inventory)
 */
export const inventoryRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const repository = new InventoryRepository(app.prisma);
  const inventoryService = new InventoryService(app.prisma, repository);
  const reservationService = new InventoryReservationService(app.prisma, repository, inventoryService);

  // 1. GET / - List store inventory balances
  app.get(
    '/',
    {
      schema: getStoreInventorySchema,
      preHandler: [app.authenticate, requireStoreAccess('inventory:read')],
    },
    async (request, reply) => {
      const { storeId } = request.params as { storeId: string };
      const query = request.query as InventoryQueryDto;
      const result = await inventoryService.listBalances(storeId, query);
      return reply.status(200).send({
        statusCode: 200,
        items: result.items,
        pagination: result.pagination,
      });
    }
  );

  // 2. GET /low-stock - List low-stock items for a store
  app.get(
    '/low-stock',
    {
      schema: getStoreLowStockSchema,
      preHandler: [app.authenticate, requireStoreAccess('inventory:read')],
    },
    async (request, reply) => {
      const { storeId } = request.params as { storeId: string };
      const query = request.query as LowStockQueryDto;
      const result = await inventoryService.listLowStock(storeId, query);
      return reply.status(200).send({
        statusCode: 200,
        items: result.items,
        pagination: result.pagination,
      });
    }
  );

  // 3. GET /movements - List store movements audit trail
  app.get(
    '/movements',
    {
      schema: getStoreMovementsSchema,
      preHandler: [app.authenticate, requireStoreAccess('inventory:read_movements')],
    },
    async (request, reply) => {
      const { storeId } = request.params as { storeId: string };
      const query = request.query as MovementQueryDto;
      const result = await inventoryService.listMovements(storeId, query);
      return reply.status(200).send({
        statusCode: 200,
        items: result.items,
        pagination: result.pagination,
      });
    }
  );

  // 4. GET /:variantId - Get single variant balance
  app.get(
    '/:variantId',
    {
      schema: getVariantBalanceSchema,
      preHandler: [app.authenticate, requireStoreAccess('inventory:read')],
    },
    async (request, reply) => {
      const { storeId, variantId } = request.params as { storeId: string; variantId: string };
      const balance = await inventoryService.getBalance(storeId, variantId);
      return reply.status(200).send({
        statusCode: 200,
        balance,
      });
    }
  );

  // 5. GET /:variantId/movements - Get variant movement ledger
  app.get(
    '/:variantId/movements',
    {
      schema: getVariantMovementsSchema,
      preHandler: [app.authenticate, requireStoreAccess('inventory:read_movements')],
    },
    async (request, reply) => {
      const { storeId, variantId } = request.params as { storeId: string; variantId: string };
      const query = request.query as MovementQueryDto;
      const result = await inventoryService.listMovements(storeId, { ...query, variantId });
      return reply.status(200).send({
        statusCode: 200,
        items: result.items,
        pagination: result.pagination,
      });
    }
  );

  // 6. POST /receipts - Receive stock into store
  app.post(
    '/receipts',
    {
      schema: receiveStockSchema,
      preHandler: [app.authenticate, requireStoreAccess('inventory:receive')],
    },
    async (request, reply) => {
      const { storeId } = request.params as { storeId: string };
      const body = receiveStockZodSchema.parse(request.body) as ReceiveStockDto;
      const result = await inventoryService.receiveStock(storeId, body, request.user?.id);
      return reply.status(201).send({
        statusCode: 201,
        balance: result.balance,
        movement: result.movement,
      });
    }
  );

  // 7. POST /adjustments - Manual stock adjustment
  app.post(
    '/adjustments',
    {
      schema: adjustStockSchema,
      preHandler: [app.authenticate, requireStoreAccess('inventory:adjust')],
    },
    async (request, reply) => {
      const { storeId } = request.params as { storeId: string };
      const body = adjustStockZodSchema.parse(request.body) as AdjustStockDto;
      const result = await inventoryService.adjustStock(storeId, body, request.user?.id);
      return reply.status(200).send({
        statusCode: 200,
        balance: result.balance,
        movement: result.movement,
      });
    }
  );

  // 8. POST /reservations - Create stock reservation
  app.post(
    '/reservations',
    {
      schema: createReservationSchema,
      preHandler: [app.authenticate, requireStoreAccess('inventory:manage_reservations')],
    },
    async (request, reply) => {
      const { storeId } = request.params as { storeId: string };
      const body = createReservationZodSchema.parse(request.body) as CreateReservationDto;
      const result = await reservationService.createReservation(storeId, body, request.user?.id);
      return reply.status(201).send({
        statusCode: 201,
        reservation: result.reservation,
        balance: result.balance,
      });
    }
  );

  // 9. PATCH /reservations/:reservationId/release - Release reservation
  app.patch(
    '/reservations/:reservationId/release',
    {
      schema: releaseReservationSchema,
      preHandler: [app.authenticate, requireStoreAccess('inventory:manage_reservations')],
    },
    async (request, reply) => {
      const { storeId, reservationId } = request.params as { storeId: string; reservationId: string };
      const result = await reservationService.releaseReservation(storeId, reservationId, request.user?.id);
      return reply.status(200).send({
        statusCode: 200,
        reservation: result.reservation,
        balance: result.balance,
      });
    }
  );

  // 10. PATCH /reservations/:reservationId/fulfill - Fulfill reservation
  app.patch(
    '/reservations/:reservationId/fulfill',
    {
      schema: fulfillReservationSchema,
      preHandler: [app.authenticate, requireStoreAccess('inventory:manage_reservations')],
    },
    async (request, reply) => {
      const { storeId, reservationId } = request.params as { storeId: string; reservationId: string };
      const result = await reservationService.fulfillReservation(storeId, reservationId, request.user?.id);
      return reply.status(200).send({
        statusCode: 200,
        reservation: result.reservation,
        balance: result.balance,
      });
    }
  );
};
