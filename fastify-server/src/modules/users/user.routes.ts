import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { UserRepository } from './user.repository.js';
import { StoreRepository } from '../stores/store.repository.js';
import { UserService } from './user.service.js';
import { requirePermissions, requireStoreAccess } from '../../plugins/authorization.js';
import {
  createStoreMemberSchema,
  deleteStoreMemberSchema,
  getStoreMembersSchema,
  getUserByIdSchema,
  getUsersSchema,
  updateStoreMemberSchema,
  updateUserSchema,
  updateUserStatusSchema,
} from './user.schemas.js';
import type {
  CreateStoreMemberDto,
  StoreMemberQueryDto,
  UpdateStoreMemberDto,
  UpdateUserDto,
  UpdateUserStatusDto,
  UserQueryDto,
} from './user.types.js';

/**
 * User Administration routes (/api/v1/users)
 */
export const userRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const userRepo = new UserRepository(app.prisma);
  const storeRepo = new StoreRepository(app.prisma);
  const userService = new UserService(userRepo, storeRepo);

  // 1. GET /api/v1/users - List users
  app.get(
    '/',
    {
      schema: getUsersSchema,
      preHandler: [app.authenticate, requirePermissions('users:read')],
    },
    async (request, reply) => {
      const query = request.query as UserQueryDto;
      const result = await userService.listUsers(query);
      return reply.status(200).send({
        statusCode: 200,
        items: result.items,
        pagination: result.pagination,
      });
    }
  );

  // 2. GET /api/v1/users/:userId - Get user by ID
  app.get(
    '/:userId',
    {
      schema: getUserByIdSchema,
      preHandler: [app.authenticate, requirePermissions('users:read')],
    },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const user = await userService.getUserById(userId);
      return reply.status(200).send({
        statusCode: 200,
        user,
      });
    }
  );

  // 3. PATCH /api/v1/users/:userId - Update user profile
  app.patch(
    '/:userId',
    {
      schema: updateUserSchema,
      preHandler: [app.authenticate, requirePermissions('users:update')],
    },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const body = request.body as UpdateUserDto;
      const user = await userService.updateUser(userId, body);
      return reply.status(200).send({
        statusCode: 200,
        user,
      });
    }
  );

  // 4. PATCH /api/v1/users/:userId/status - Change user account status
  app.patch(
    '/:userId/status',
    {
      schema: updateUserStatusSchema,
      preHandler: [app.authenticate, requirePermissions('users:manage_status')],
    },
    async (request, reply) => {
      const { userId } = request.params as { userId: string };
      const body = request.body as UpdateUserStatusDto;
      const user = await userService.updateUserStatus(userId, body);
      return reply.status(200).send({
        statusCode: 200,
        user,
      });
    }
  );
};

/**
 * Store Membership routes (/api/v1/stores/:storeId/members)
 */
export const storeMemberRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const userRepo = new UserRepository(app.prisma);
  const storeRepo = new StoreRepository(app.prisma);
  const userService = new UserService(userRepo, storeRepo);

  // 1. GET /api/v1/stores/:storeId/members - List members
  app.get(
    '/',
    {
      schema: getStoreMembersSchema,
      preHandler: [app.authenticate, requireStoreAccess('store_members:read')],
    },
    async (request, reply) => {
      const { storeId } = request.params as { storeId: string };
      const query = request.query as StoreMemberQueryDto;
      const result = await userService.listStoreMembers(storeId, query);
      return reply.status(200).send({
        statusCode: 200,
        items: result.items,
        pagination: result.pagination,
      });
    }
  );

  // 2. POST /api/v1/stores/:storeId/members - Add member
  app.post(
    '/',
    {
      schema: createStoreMemberSchema,
      preHandler: [app.authenticate, requireStoreAccess('store_members:create')],
    },
    async (request, reply) => {
      const { storeId } = request.params as { storeId: string };
      const body = request.body as CreateStoreMemberDto;
      const member = await userService.createStoreMember(storeId, body, request.user?.id);
      return reply.status(201).send({
        statusCode: 201,
        member,
      });
    }
  );

  // 3. PATCH /api/v1/stores/:storeId/members/:membershipId - Update member
  app.patch(
    '/:membershipId',
    {
      schema: updateStoreMemberSchema,
      preHandler: [app.authenticate, requireStoreAccess('store_members:update')],
    },
    async (request, reply) => {
      const { storeId, membershipId } = request.params as { storeId: string; membershipId: string };
      const body = request.body as UpdateStoreMemberDto;
      const member = await userService.updateStoreMember(storeId, membershipId, body);
      return reply.status(200).send({
        statusCode: 200,
        member,
      });
    }
  );

  // 4. DELETE /api/v1/stores/:storeId/members/:membershipId - Remove member
  app.delete(
    '/:membershipId',
    {
      schema: deleteStoreMemberSchema,
      preHandler: [app.authenticate, requireStoreAccess('store_members:remove')],
    },
    async (request, reply) => {
      const { storeId, membershipId } = request.params as { storeId: string; membershipId: string };
      await userService.deleteStoreMember(storeId, membershipId);
      return reply.status(200).send({
        statusCode: 200,
        success: true,
        message: 'Store membership removed successfully.',
      });
    }
  );
};
