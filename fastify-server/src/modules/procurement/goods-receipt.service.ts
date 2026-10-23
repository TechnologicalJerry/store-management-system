import { Prisma, type PrismaClient } from '@prisma/client';
import { ProcurementRepository } from './procurement.repository.js';
import { InventoryRepository } from '../inventory/inventory.repository.js';
import type {
  CreateGoodsReceiptDto,
  GoodsReceiptItemResponse,
  GoodsReceiptQueryDto,
  GoodsReceiptResponse,
  PurchaseOrderStatus,
} from './procurement.types.js';
import {
  DECIMAL_PLACES_QTY,
  RECEIVABLE_PO_STATES,
} from './procurement.constants.js';
import {
  DuplicateReceiptIdempotencyError,
  GoodsReceiptNotFoundError,
  InvalidPurchaseOrderStateError,
  InvalidReceivedQuantityError,
  PurchaseOrderNotFoundError,
} from './procurement.errors.js';
import { BadRequestError } from '../../common/errors/app-error.js';

export class GoodsReceiptService {
  private readonly repository: ProcurementRepository;
  private readonly inventoryRepository: InventoryRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.repository = new ProcurementRepository(prisma);
    this.inventoryRepository = new InventoryRepository(prisma);
  }

  // ============================================================================
  // Serialization Helpers
  // ============================================================================

  private serializeReceiptItem(item: any): GoodsReceiptItemResponse {
    return {
      id: item.id,
      goodsReceiptId: item.goodsReceiptId,
      purchaseOrderItemId: item.purchaseOrderItemId,
      variantId: item.variantId,
      quantityDelivered: new Prisma.Decimal(item.quantityDelivered.toString()).toFixed(DECIMAL_PLACES_QTY),
      quantityAccepted: new Prisma.Decimal(item.quantityAccepted.toString()).toFixed(DECIMAL_PLACES_QTY),
      quantityRejected: new Prisma.Decimal(item.quantityRejected.toString()).toFixed(DECIMAL_PLACES_QTY),
      rejectionReason: item.rejectionReason,
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
      variant: item.variant
        ? {
            id: item.variant.id,
            name: item.variant.name,
            sku: item.variant.sku,
            barcode: item.variant.barcode,
          }
        : undefined,
    };
  }

  private serializeGoodsReceipt(receipt: any): GoodsReceiptResponse {
    return {
      id: receipt.id,
      receiptNumber: receipt.receiptNumber,
      purchaseOrderId: receipt.purchaseOrderId,
      destinationStoreId: receipt.destinationStoreId,
      status: receipt.status,
      receivedByUserId: receipt.receivedByUserId,
      receivedByUser: receipt.receivedByUser
        ? { id: receipt.receivedByUser.id, name: receipt.receivedByUser.name, email: receipt.receivedByUser.email }
        : null,
      receivedAt: receipt.receivedAt instanceof Date ? receipt.receivedAt.toISOString() : receipt.receivedAt,
      deliveryReference: receipt.deliveryReference,
      notes: receipt.notes,
      idempotencyKey: receipt.idempotencyKey,
      createdAt: receipt.createdAt instanceof Date ? receipt.createdAt.toISOString() : receipt.createdAt,
      updatedAt: receipt.updatedAt instanceof Date ? receipt.updatedAt.toISOString() : receipt.updatedAt,
      items: (receipt.items || []).map((item: any) => this.serializeReceiptItem(item)),
      purchaseOrder: receipt.purchaseOrder
        ? {
            id: receipt.purchaseOrder.id,
            purchaseOrderNumber: receipt.purchaseOrder.purchaseOrderNumber,
            status: receipt.purchaseOrder.status,
          }
        : undefined,
    };
  }

  // ============================================================================
  // Receiving Workflow & Inventory Integration
  // ============================================================================

  async receiveGoods(
    purchaseOrderId: string,
    dto: CreateGoodsReceiptDto,
    receivedByUserId?: string
  ): Promise<GoodsReceiptResponse> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestError('At least one receipt line item is required.');
    }

    // 1. Idempotency Check
    if (dto.idempotencyKey) {
      const existing = await this.repository.findGoodsReceiptByIdempotencyKey(dto.idempotencyKey);
      if (existing) {
        if (existing.purchaseOrderId === purchaseOrderId) {
          // Idempotent replay: return previously processed receipt
          return this.serializeGoodsReceipt(existing);
        }
        throw new DuplicateReceiptIdempotencyError();
      }
    }

    // 2. Interactive Transaction with Row-Level Locks and Atomic Inventory Updates
    return this.prisma.$transaction(async tx => {
      // Lock purchase order row FOR UPDATE
      const lockedPo = await this.repository.findPurchaseOrderForUpdate(purchaseOrderId, tx);
      if (!lockedPo) {
        throw new PurchaseOrderNotFoundError();
      }

      const po = await this.repository.findPurchaseOrderById(purchaseOrderId, tx);
      if (!po) {
        throw new PurchaseOrderNotFoundError();
      }

      if (!RECEIVABLE_PO_STATES.includes(po.status)) {
        throw new InvalidPurchaseOrderStateError(
          `Cannot receive goods for purchase order in '${po.status}' state. Only ORDERED or PARTIALLY_RECEIVED orders can receive goods.`
        );
      }

      const poItemMap = new Map<string, (typeof po.items)[0]>();
      for (const item of po.items) {
        poItemMap.set(item.id, item);
      }

      // 3. Validate line items and delivered vs accepted/rejected balance
      const processedItems: Array<{
        purchaseOrderItemId: string;
        variantId: string;
        quantityDelivered: Prisma.Decimal;
        quantityAccepted: Prisma.Decimal;
        quantityRejected: Prisma.Decimal;
        rejectionReason?: string | null;
      }> = [];

      for (const itemDto of dto.items) {
        const poItem = poItemMap.get(itemDto.purchaseOrderItemId);
        if (!poItem) {
          throw new BadRequestError(
            `Purchase order line item '${itemDto.purchaseOrderItemId}' does not belong to this purchase order.`
          );
        }

        const delivered = new Prisma.Decimal(itemDto.quantityDelivered.toString());
        const accepted = new Prisma.Decimal(itemDto.quantityAccepted.toString());
        const rejected = new Prisma.Decimal((itemDto.quantityRejected ?? 0).toString());

        if (delivered.lessThan(0) || accepted.lessThan(0) || rejected.lessThan(0)) {
          throw new BadRequestError('Received quantities must be non-negative.');
        }

        // Integrity invariant: accepted + rejected must equal delivered
        if (!accepted.plus(rejected).equals(delivered)) {
          throw new InvalidReceivedQuantityError(
            `Line ${poItem.skuSnapshot}: accepted (${accepted}) plus rejected (${rejected}) does not equal delivered (${delivered}).`
          );
        }

        if (rejected.greaterThan(0) && (!itemDto.rejectionReason || itemDto.rejectionReason.trim().length === 0)) {
          throw new BadRequestError(
            `Rejection reason is required for rejected items on line ${poItem.skuSnapshot}.`
          );
        }

        // Check against outstanding quantity
        const currentReceived = new Prisma.Decimal(poItem.quantityReceived.toString());
        const ordered = new Prisma.Decimal(poItem.quantityOrdered.toString());
        const outstanding = ordered.minus(currentReceived);

        if (accepted.greaterThan(outstanding)) {
          throw new InvalidReceivedQuantityError(
            `Accepted quantity (${accepted}) for line ${poItem.skuSnapshot} exceeds remaining outstanding quantity (${outstanding}).`
          );
        }

        processedItems.push({
          purchaseOrderItemId: itemDto.purchaseOrderItemId,
          variantId: poItem.variantId,
          quantityDelivered: delivered,
          quantityAccepted: accepted,
          quantityRejected: rejected,
          rejectionReason: itemDto.rejectionReason,
        });
      }

      // 4. Update PO Item Received Quantities
      for (const p of processedItems) {
        if (p.quantityAccepted.greaterThan(0)) {
          await this.repository.incrementPoItemReceivedQuantity(
            p.purchaseOrderItemId,
            p.quantityAccepted,
            tx
          );
        }
      }

      // 5. Integrate with Store Inventory (Row-Level Locking & Movement Ledger)
      // Deadlock prevention: sort variant IDs alphabetically
      const acceptedUpdates = processedItems
        .filter(p => p.quantityAccepted.greaterThan(0))
        .sort((a, b) => a.variantId.localeCompare(b.variantId));

      for (const update of acceptedUpdates) {
        // Ensure balance record exists
        await this.inventoryRepository.ensureBalanceExists(
          po.destinationStoreId,
          update.variantId,
          new Prisma.Decimal(0),
          tx
        );

        // Exclusive row lock FOR UPDATE
        const lockedBalance = await this.inventoryRepository.findBalanceForUpdate(
          po.destinationStoreId,
          update.variantId,
          tx
        );
        if (!lockedBalance) {
          throw new BadRequestError('Unable to acquire lock on inventory balance.');
        }

        const beforeOnHand = new Prisma.Decimal(lockedBalance.quantity_on_hand.toString());
        const afterOnHand = beforeOnHand.plus(update.quantityAccepted);

        // Record immutable inventory movement ledger entry
        await this.inventoryRepository.createMovement(
          {
            storeId: po.destinationStoreId,
            variantId: update.variantId,
            movementType: 'STOCK_RECEIVED',
            quantityDelta: update.quantityAccepted,
            quantityBefore: beforeOnHand,
            quantityAfter: afterOnHand,
            referenceType: 'PURCHASE_ORDER',
            referenceId: po.purchaseOrderNumber,
            idempotencyKey: dto.idempotencyKey ? `${dto.idempotencyKey}-${update.variantId}` : undefined,
            reason: `Goods receipt for Purchase Order ${po.purchaseOrderNumber}`,
            notes: dto.notes,
            performedByUserId: receivedByUserId,
          },
          tx
        );

        // Update inventory balance on-hand stock
        await this.inventoryRepository.updateBalance(
          lockedBalance.id,
          { quantityOnHand: afterOnHand },
          tx
        );
      }

      // 6. Generate Goods Receipt Number and Record Receipt
      const receiptNumber = await this.repository.generateReceiptNumber(tx);

      const receipt = await this.repository.createGoodsReceipt(
        {
          receiptNumber,
          purchaseOrderId,
          destinationStoreId: po.destinationStoreId,
          status: 'COMPLETED',
          receivedByUserId,
          deliveryReference: dto.deliveryReference,
          notes: dto.notes,
          idempotencyKey: dto.idempotencyKey,
        },
        processedItems.map(p => ({
          purchaseOrderItemId: p.purchaseOrderItemId,
          variantId: p.variantId,
          quantityDelivered: p.quantityDelivered,
          quantityAccepted: p.quantityAccepted,
          quantityRejected: p.quantityRejected,
          rejectionReason: p.rejectionReason,
        })),
        tx
      );

      // 7. Evaluate and Transition Purchase Order Status
      // Re-fetch all items for this PO to check total completion
      const updatedPoItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId },
      });

      const isFullyReceived = updatedPoItems.every(item => {
        const ordered = new Prisma.Decimal(item.quantityOrdered.toString());
        const rec = new Prisma.Decimal(item.quantityReceived.toString());
        return rec.greaterThanOrEqualTo(ordered);
      });

      const newPoStatus: PurchaseOrderStatus = isFullyReceived
        ? 'RECEIVED'
        : 'PARTIALLY_RECEIVED';

      if (newPoStatus !== po.status) {
        await tx.purchaseOrder.update({
          where: { id: purchaseOrderId },
          data: { status: newPoStatus },
        });

        await this.repository.createStatusHistory(
          purchaseOrderId,
          po.status,
          newPoStatus,
          receivedByUserId,
          isFullyReceived
            ? 'All ordered goods fully received'
            : 'Partial delivery received and logged into store inventory',
          tx
        );
      }

      return this.serializeGoodsReceipt(receipt);
    });
  }

  async getGoodsReceiptById(id: string): Promise<GoodsReceiptResponse> {
    const receipt = await this.repository.findGoodsReceiptById(id);
    if (!receipt) {
      throw new GoodsReceiptNotFoundError();
    }
    return this.serializeGoodsReceipt(receipt);
  }

  async listGoodsReceipts(query: GoodsReceiptQueryDto) {
    const result = await this.repository.listGoodsReceipts(query);
    return {
      items: result.items.map(r => this.serializeGoodsReceipt(r)),
      meta: result.meta,
    };
  }
}
