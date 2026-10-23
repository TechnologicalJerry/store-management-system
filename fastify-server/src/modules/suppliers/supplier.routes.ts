import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { SupplierService } from './supplier.service.js';
import { requirePermissions } from '../../plugins/authorization.js';
import {
  addSupplierProductSchema,
  createSupplierProductZodSchema,
  createSupplierSchema,
  createSupplierZodSchema,
  deleteSupplierSchema,
  getSupplierByIdSchema,
  listSupplierProductsSchema,
  listSuppliersSchema,
  removeSupplierProductSchema,
  supplierProductQueryZodSchema,
  supplierQueryZodSchema,
  updateSupplierProductSchema,
  updateSupplierProductZodSchema,
  updateSupplierSchema,
  updateSupplierStatusSchema,
  updateSupplierStatusZodSchema,
  updateSupplierZodSchema,
} from './supplier.schemas.js';
import type {
  CreateSupplierDto,
  CreateSupplierProductDto,
  SupplierProductQueryDto,
  SupplierQueryDto,
  UpdateSupplierDto,
  UpdateSupplierProductDto,
  UpdateSupplierStatusDto,
} from './supplier.types.js';

export const supplierRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const supplierService = new SupplierService(app.prisma);

  // 1. POST /api/v1/suppliers - Register new supplier
  app.post(
    '/',
    {
      schema: createSupplierSchema,
      preHandler: [app.authenticate, requirePermissions('suppliers:create')],
    },
    async (request, reply) => {
      const validatedBody = createSupplierZodSchema.parse(request.body) as CreateSupplierDto;
      const supplier = await supplierService.createSupplier(validatedBody);
      return reply.status(201).send({
        success: true,
        data: supplier,
      });
    }
  );

  // 2. GET /api/v1/suppliers - List suppliers with pagination and search
  app.get(
    '/',
    {
      schema: listSuppliersSchema,
      preHandler: [app.authenticate, requirePermissions('suppliers:read')],
    },
    async (request, reply) => {
      const query = supplierQueryZodSchema.parse(request.query) as SupplierQueryDto;
      const result = await supplierService.listSuppliers(query);
      return reply.status(200).send({
        success: true,
        data: result.items,
        meta: result.meta,
      });
    }
  );

  // 3. GET /api/v1/suppliers/:supplierId - Get single supplier by ID
  app.get(
    '/:supplierId',
    {
      schema: getSupplierByIdSchema,
      preHandler: [app.authenticate, requirePermissions('suppliers:read')],
    },
    async (request, reply) => {
      const { supplierId } = request.params as { supplierId: string };
      const supplier = await supplierService.getSupplierById(supplierId);
      return reply.status(200).send({
        success: true,
        data: supplier,
      });
    }
  );

  // 4. PATCH /api/v1/suppliers/:supplierId - Update supplier details
  app.patch(
    '/:supplierId',
    {
      schema: updateSupplierSchema,
      preHandler: [app.authenticate, requirePermissions('suppliers:update')],
    },
    async (request, reply) => {
      const { supplierId } = request.params as { supplierId: string };
      const validatedBody = updateSupplierZodSchema.parse(request.body) as UpdateSupplierDto;
      const supplier = await supplierService.updateSupplier(supplierId, validatedBody);
      return reply.status(200).send({
        success: true,
        data: supplier,
      });
    }
  );

  // 5. PATCH /api/v1/suppliers/:supplierId/status - Update supplier status
  app.patch(
    '/:supplierId/status',
    {
      schema: updateSupplierStatusSchema,
      preHandler: [app.authenticate, requirePermissions('suppliers:update')],
    },
    async (request, reply) => {
      const { supplierId } = request.params as { supplierId: string };
      const validatedBody = updateSupplierStatusZodSchema.parse(request.body) as UpdateSupplierStatusDto;
      const supplier = await supplierService.updateSupplierStatus(supplierId, validatedBody);
      return reply.status(200).send({
        success: true,
        data: supplier,
      });
    }
  );

  // 6. DELETE /api/v1/suppliers/:supplierId - Soft delete supplier
  app.delete(
    '/:supplierId',
    {
      schema: deleteSupplierSchema,
      preHandler: [app.authenticate, requirePermissions('suppliers:delete')],
    },
    async (request, reply) => {
      const { supplierId } = request.params as { supplierId: string };
      const result = await supplierService.deleteSupplier(supplierId);
      return reply.status(200).send(result);
    }
  );

  // ============================================================================
  // Supplier Product Catalog Routes
  // ============================================================================

  // 7. GET /api/v1/suppliers/:supplierId/products - List products offered by supplier
  app.get(
    '/:supplierId/products',
    {
      schema: listSupplierProductsSchema,
      preHandler: [app.authenticate, requirePermissions('suppliers:read')],
    },
    async (request, reply) => {
      const { supplierId } = request.params as { supplierId: string };
      const query = supplierProductQueryZodSchema.parse(request.query) as SupplierProductQueryDto;
      const result = await supplierService.listSupplierProducts(supplierId, query);
      return reply.status(200).send({
        success: true,
        data: result.items,
        meta: result.meta,
      });
    }
  );

  // 8. POST /api/v1/suppliers/:supplierId/products - Add product variant to supplier catalog
  app.post(
    '/:supplierId/products',
    {
      schema: addSupplierProductSchema,
      preHandler: [app.authenticate, requirePermissions('suppliers:update')],
    },
    async (request, reply) => {
      const { supplierId } = request.params as { supplierId: string };
      const validatedBody = createSupplierProductZodSchema.parse(request.body) as CreateSupplierProductDto;
      const product = await supplierService.addSupplierProduct(supplierId, validatedBody);
      return reply.status(201).send({
        success: true,
        data: product,
      });
    }
  );

  // 9. PATCH /api/v1/suppliers/:supplierId/products/:supplierProductId - Update supplier product offering
  app.patch(
    '/:supplierId/products/:supplierProductId',
    {
      schema: updateSupplierProductSchema,
      preHandler: [app.authenticate, requirePermissions('suppliers:update')],
    },
    async (request, reply) => {
      const { supplierId, supplierProductId } = request.params as {
        supplierId: string;
        supplierProductId: string;
      };
      const validatedBody = updateSupplierProductZodSchema.parse(request.body) as UpdateSupplierProductDto;
      const product = await supplierService.updateSupplierProduct(
        supplierId,
        supplierProductId,
        validatedBody
      );
      return reply.status(200).send({
        success: true,
        data: product,
      });
    }
  );

  // 10. DELETE /api/v1/suppliers/:supplierId/products/:supplierProductId - Remove variant from supplier offerings
  app.delete(
    '/:supplierId/products/:supplierProductId',
    {
      schema: removeSupplierProductSchema,
      preHandler: [app.authenticate, requirePermissions('suppliers:delete')],
    },
    async (request, reply) => {
      const { supplierId, supplierProductId } = request.params as {
        supplierId: string;
        supplierProductId: string;
      };
      const result = await supplierService.removeSupplierProduct(supplierId, supplierProductId);
      return reply.status(200).send(result);
    }
  );
};
