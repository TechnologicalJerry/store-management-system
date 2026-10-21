import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { StoreRepository } from './store.repository.js';
import { StoreService } from './store.service.js';
import { requirePermissions } from '../../plugins/authorization.js';
import {
  createStoreSchema,
  getStoreByIdSchema,
  getStoresSchema,
  updateStoreSchema,
  updateStoreStatusSchema,
} from './store.schemas.js';
import type {
  CreateStoreDto,
  StoreQueryDto,
  StoreStatus,
  UpdateStoreDto,
} from './store.types.js';

export const storeRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const storeRepo = new StoreRepository(app.prisma);
  const storeService = new StoreService(storeRepo);

  // 1. POST /api/v1/stores - Create new store
  app.post(
    '/',
    {
      schema: createStoreSchema,
      preHandler: [app.authenticate, requirePermissions('stores:create')],
    },
    async (request, reply) => {
      const body = request.body as CreateStoreDto;
      const store = await storeService.createStore(body);
      return reply.status(201).send({
        statusCode: 201,
        store,
      });
    }
  );

  // 2. GET /api/v1/stores - List stores with pagination and filters
  app.get(
    '/',
    {
      schema: getStoresSchema,
      preHandler: [app.authenticate, requirePermissions('stores:read')],
    },
    async (request, reply) => {
      const query = request.query as StoreQueryDto;
      const result = await storeService.listStores(query);
      return reply.status(200).send({
        statusCode: 200,
        items: result.items,
        pagination: result.pagination,
      });
    }
  );

  // 3. GET /api/v1/stores/:storeId - Get store by ID
  app.get(
    '/:storeId',
    {
      schema: getStoreByIdSchema,
      preHandler: [app.authenticate, requirePermissions('stores:read')],
    },
    async (request, reply) => {
      const { storeId } = request.params as { storeId: string };
      const store = await storeService.getStoreById(storeId);
      return reply.status(200).send({
        statusCode: 200,
        store,
      });
    }
  );

  // 4. PATCH /api/v1/stores/:storeId - Update store metadata
  app.patch(
    '/:storeId',
    {
      schema: updateStoreSchema,
      preHandler: [app.authenticate, requirePermissions('stores:update')],
    },
    async (request, reply) => {
      const { storeId } = request.params as { storeId: string };
      const body = request.body as UpdateStoreDto;
      const store = await storeService.updateStore(storeId, body);
      return reply.status(200).send({
        statusCode: 200,
        store,
      });
    }
  );

  // 5. PATCH /api/v1/stores/:storeId/status - Change store operational status
  app.patch(
    '/:storeId/status',
    {
      schema: updateStoreStatusSchema,
      preHandler: [app.authenticate, requirePermissions('stores:manage_status')],
    },
    async (request, reply) => {
      const { storeId } = request.params as { storeId: string };
      const { status } = request.body as { status: StoreStatus };
      const store = await storeService.updateStoreStatus(storeId, status);
      return reply.status(200).send({
        statusCode: 200,
        store,
      });
    }
  );
};
