import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ProductRepository } from './product.repository.js';
import { CategoryRepository } from '../categories/category.repository.js';
import { ProductService } from './product.service.js';
import { requirePermissions } from '../../plugins/authorization.js';
import {
  createProductSchema,
  createVariantSchema,
  getProductByIdSchema,
  getProductsSchema,
  getVariantByIdSchema,
  getVariantsByProductSchema,
  updateProductSchema,
  updateProductStatusSchema,
  updateVariantSchema,
  updateVariantStatusSchema,
} from './product.schemas.js';
import type {
  CreateProductDto,
  CreateProductVariantDto,
  ProductQueryDto,
  UpdateProductDto,
  UpdateProductStatusDto,
  UpdateVariantDto,
  UpdateVariantStatusDto,
} from './product.types.js';

/**
 * Product Catalog routes (/api/v1/products)
 */
export const productRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const productRepo = new ProductRepository(app.prisma);
  const categoryRepo = new CategoryRepository(app.prisma);
  const productService = new ProductService(app.prisma, productRepo, categoryRepo);

  // 1. POST /api/v1/products - Create product
  app.post(
    '/',
    {
      schema: createProductSchema,
      preHandler: [app.authenticate, requirePermissions('products:create')],
    },
    async (request, reply) => {
      const body = request.body as CreateProductDto;
      const product = await productService.createProduct(body);
      return reply.status(201).send({
        statusCode: 201,
        product,
      });
    }
  );

  // 2. GET /api/v1/products - List products
  app.get(
    '/',
    {
      schema: getProductsSchema,
      preHandler: [app.authenticate, requirePermissions('products:read')],
    },
    async (request, reply) => {
      const query = request.query as ProductQueryDto;
      const result = await productService.listProducts(query);
      return reply.status(200).send({
        statusCode: 200,
        items: result.items,
        pagination: result.pagination,
      });
    }
  );

  // 3. GET /api/v1/products/:productId - Get product by ID
  app.get(
    '/:productId',
    {
      schema: getProductByIdSchema,
      preHandler: [app.authenticate, requirePermissions('products:read')],
    },
    async (request, reply) => {
      const { productId } = request.params as { productId: string };
      const product = await productService.getProductById(productId);
      return reply.status(200).send({
        statusCode: 200,
        product,
      });
    }
  );

  // 4. PATCH /api/v1/products/:productId - Update product
  app.patch(
    '/:productId',
    {
      schema: updateProductSchema,
      preHandler: [app.authenticate, requirePermissions('products:update')],
    },
    async (request, reply) => {
      const { productId } = request.params as { productId: string };
      const body = request.body as UpdateProductDto;
      const product = await productService.updateProduct(productId, body);
      return reply.status(200).send({
        statusCode: 200,
        product,
      });
    }
  );

  // 5. PATCH /api/v1/products/:productId/status - Change product status
  app.patch(
    '/:productId/status',
    {
      schema: updateProductStatusSchema,
      preHandler: [app.authenticate, requirePermissions('products:manage_status')],
    },
    async (request, reply) => {
      const { productId } = request.params as { productId: string };
      const body = request.body as UpdateProductStatusDto;
      const product = await productService.updateProductStatus(productId, body);
      return reply.status(200).send({
        statusCode: 200,
        product,
      });
    }
  );

  // 6. POST /api/v1/products/:productId/variants - Add variant to product
  app.post(
    '/:productId/variants',
    {
      schema: createVariantSchema,
      preHandler: [app.authenticate, requirePermissions('product_variants:manage')],
    },
    async (request, reply) => {
      const { productId } = request.params as { productId: string };
      const body = request.body as CreateProductVariantDto;
      const variant = await productService.createVariant(productId, body);
      return reply.status(201).send({
        statusCode: 201,
        variant,
      });
    }
  );

  // 7. GET /api/v1/products/:productId/variants - List variants for product
  app.get(
    '/:productId/variants',
    {
      schema: getVariantsByProductSchema,
      preHandler: [app.authenticate, requirePermissions('products:read')],
    },
    async (request, reply) => {
      const { productId } = request.params as { productId: string };
      const variants = await productService.getVariantsByProductId(productId);
      return reply.status(200).send({
        statusCode: 200,
        variants,
      });
    }
  );
};

/**
 * Product Variant routes (/api/v1/variants)
 */
export const variantRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const productRepo = new ProductRepository(app.prisma);
  const categoryRepo = new CategoryRepository(app.prisma);
  const productService = new ProductService(app.prisma, productRepo, categoryRepo);

  // 1. GET /api/v1/variants/:variantId - Get variant by ID
  app.get(
    '/:variantId',
    {
      schema: getVariantByIdSchema,
      preHandler: [app.authenticate, requirePermissions('products:read')],
    },
    async (request, reply) => {
      const { variantId } = request.params as { variantId: string };
      const variant = await productService.getVariantById(variantId);
      return reply.status(200).send({
        statusCode: 200,
        variant,
      });
    }
  );

  // 2. PATCH /api/v1/variants/:variantId - Update variant
  app.patch(
    '/:variantId',
    {
      schema: updateVariantSchema,
      preHandler: [app.authenticate, requirePermissions('product_variants:manage')],
    },
    async (request, reply) => {
      const { variantId } = request.params as { variantId: string };
      const body = request.body as UpdateVariantDto;
      const variant = await productService.updateVariant(variantId, body);
      return reply.status(200).send({
        statusCode: 200,
        variant,
      });
    }
  );

  // 3. PATCH /api/v1/variants/:variantId/status - Update variant status
  app.patch(
    '/:variantId/status',
    {
      schema: updateVariantStatusSchema,
      preHandler: [app.authenticate, requirePermissions('product_variants:manage')],
    },
    async (request, reply) => {
      const { variantId } = request.params as { variantId: string };
      const body = request.body as UpdateVariantStatusDto;
      const variant = await productService.updateVariantStatus(variantId, body);
      return reply.status(200).send({
        statusCode: 200,
        variant,
      });
    }
  );
};
