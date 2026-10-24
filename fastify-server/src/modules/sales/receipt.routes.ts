import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ReceiptService } from './receipt.service.js';
import { receiptIdParamsSchema } from './sale.schemas.js';
import { requirePermissions } from '../../plugins/authorization.js';

export const receiptRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const receiptService = new ReceiptService(app.prisma);

  /**
   * GET /receipts/:receiptId
   * Retrieves an immutable customer receipt by its receiptId.
   */
  app.get(
    '/:receiptId',
    {
      preHandler: [requirePermissions('receipts:read')],
      schema: {
        description: 'Retrieve an immutable customer receipt by receipt ID',
        tags: ['Receipts'],
        params: {
          type: 'object',
          required: ['receiptId'],
          properties: {
            receiptId: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const { receiptId } = receiptIdParamsSchema.parse(request.params);
      const receipt = await receiptService.getReceiptById(receiptId);
      return reply.code(200).send({
        success: true,
        data: receipt,
      });
    }
  );
};
