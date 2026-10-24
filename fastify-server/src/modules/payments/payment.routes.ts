import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { PaymentService } from './payment.service.js';
import { RefundService } from './refund.service.js';
import {
  recordPaymentSchema,
  capturePaymentSchema,
  voidPaymentSchema,
  createRefundSchema,
  paymentIdParamsSchema,
  refundIdParamsSchema,
} from './payment.schemas.js';
import { requirePermissions, requireRoles } from '../../plugins/authorization.js';
import { requireStoreAccess } from '../../plugins/authorization.js';

export const paymentRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const paymentService = new PaymentService(app.prisma);
  const refundService = new RefundService(app.prisma);

  /**
   * GET /payments/:paymentId
   * Retrieves detailed payment record by ID.
   */
  app.get(
    '/:paymentId',
    {
      preHandler: [requirePermissions('payments:read')],
      schema: {
        description: 'Retrieve detailed payment transaction record by ID',
        tags: ['Payments'],
        params: {
          type: 'object',
          required: ['paymentId'],
          properties: {
            paymentId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { paymentId } = paymentIdParamsSchema.parse(request.params);
      const payment = await paymentService.getPaymentById(paymentId);
      return reply.code(200).send({
        success: true,
        data: payment,
      });
    }
  );

  /**
   * POST /payments/:paymentId/capture
   * Captures an authorized payment.
   */
  app.post(
    '/:paymentId/capture',
    {
      preHandler: [requirePermissions('payments:capture')],
      schema: {
        description: 'Capture a previously authorized payment',
        tags: ['Payments'],
        params: {
          type: 'object',
          required: ['paymentId'],
          properties: {
            paymentId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          properties: {
            amount: { type: 'string', description: 'Optional capture amount if different from authorized' },
            idempotencyKey: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { paymentId } = paymentIdParamsSchema.parse(request.params);
      const body = capturePaymentSchema.parse(request.body ?? {});
      const captured = await paymentService.capturePayment(paymentId, body);
      return reply.code(200).send({
        success: true,
        data: captured,
      });
    }
  );

  /**
   * POST /payments/:paymentId/void
   * Voids an uncaptured authorized payment.
   */
  app.post(
    '/:paymentId/void',
    {
      preHandler: [requirePermissions('payments:void')],
      schema: {
        description: 'Void an uncaptured or authorized payment attempt',
        tags: ['Payments'],
        params: {
          type: 'object',
          required: ['paymentId'],
          properties: {
            paymentId: { type: 'string', format: 'uuid' },
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
      const { paymentId } = paymentIdParamsSchema.parse(request.params);
      const body = voidPaymentSchema.parse(request.body);
      const voided = await paymentService.voidPayment(paymentId, body);
      return reply.code(200).send({
        success: true,
        data: voided,
      });
    }
  );

  /**
   * POST /payments/:paymentId/refunds
   * Issues a refund against an eligible captured payment.
   */
  app.post(
    '/:paymentId/refunds',
    {
      preHandler: [requirePermissions('payments:refund')],
      schema: {
        description: 'Issue a refund against a captured payment',
        tags: ['Payments'],
        params: {
          type: 'object',
          required: ['paymentId'],
          properties: {
            paymentId: { type: 'string', format: 'uuid' },
          },
        },
        body: {
          type: 'object',
          required: ['amount', 'reason'],
          properties: {
            amount: { type: 'string', description: 'Refund amount in decimal format' },
            reason: { type: 'string', minLength: 3, maxLength: 255 },
            idempotencyKey: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const { paymentId } = paymentIdParamsSchema.parse(request.params);
      const body = createRefundSchema.parse(request.body);
      const refund = await refundService.processRefund(paymentId, request.user!.id, body);
      return reply.code(201).send({
        success: true,
        data: refund,
      });
    }
  );

  /**
   * GET /payments/:paymentId/refunds
   * Lists all refunds associated with a payment.
   */
  app.get(
    '/:paymentId/refunds',
    {
      preHandler: [requirePermissions('payments:read')],
      schema: {
        description: 'List all refund attempts associated with a payment',
        tags: ['Payments'],
        params: {
          type: 'object',
          required: ['paymentId'],
          properties: {
            paymentId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { paymentId } = paymentIdParamsSchema.parse(request.params);
      const refunds = await refundService.listRefundsByPaymentId(paymentId);
      return reply.code(200).send({
        success: true,
        data: refunds,
      });
    }
  );
};
