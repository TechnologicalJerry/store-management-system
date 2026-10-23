import { Prisma, type PrismaClient } from '@prisma/client';
import { ProcurementRepository } from './procurement.repository.js';
import type {
  ApprovePurchaseOrderDto,
  CancelPurchaseOrderDto,
  CreatePurchaseOrderDto,
  PurchaseOrderItemResponse,
  PurchaseOrderQueryDto,
  PurchaseOrderResponse,
  PurchaseOrderStatus,
  UpdatePurchaseOrderDto,
} from './procurement.types.js';
import {
  ALLOWED_PO_TRANSITIONS,
  CANCELLABLE_PO_STATES,
  DECIMAL_PLACES_MONEY,
  DECIMAL_PLACES_QTY,
  EDITABLE_PO_STATES,
} from './procurement.constants.js';
import {
  EmptyPurchaseOrderItemsError,
  InactiveStoreForOrderError,
  InactiveSupplierForOrderError,
  InvalidPurchaseOrderStateError,
  PurchaseOrderImmutableError,
  PurchaseOrderNotFoundError,
  SeparationOfDutiesError,
} from './procurement.errors.js';
import { BadRequestError, NotFoundError } from '../../common/errors/app-error.js';

export class PurchaseOrderService {
  private readonly repository: ProcurementRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.repository = new ProcurementRepository(prisma);
  }

  // ============================================================================
  // Serialization Helpers
  // ============================================================================

  private serializeItem(item: any): PurchaseOrderItemResponse {
    const qtyOrdered = new Prisma.Decimal(item.quantityOrdered.toString());
    const qtyReceived = new Prisma.Decimal(item.quantityReceived.toString());
    const qtyOutstanding = qtyOrdered.minus(qtyReceived);

    return {
      id: item.id,
      purchaseOrderId: item.purchaseOrderId,
      variantId: item.variantId,
      supplierProductId: item.supplierProductId,
      skuSnapshot: item.skuSnapshot,
      productNameSnapshot: item.productNameSnapshot,
      supplierSkuSnapshot: item.supplierSkuSnapshot,
      quantityOrdered: qtyOrdered.toFixed(DECIMAL_PLACES_QTY),
      quantityReceived: qtyReceived.toFixed(DECIMAL_PLACES_QTY),
      quantityOutstanding: (qtyOutstanding.greaterThan(0) ? qtyOutstanding : new Prisma.Decimal(0)).toFixed(
        DECIMAL_PLACES_QTY
      ),
      unitPrice: new Prisma.Decimal(item.unitPrice.toString()).toFixed(DECIMAL_PLACES_MONEY),
      discountAmount: new Prisma.Decimal(item.discountAmount.toString()).toFixed(DECIMAL_PLACES_MONEY),
      taxRate: new Prisma.Decimal(item.taxRate.toString()).toFixed(4),
      lineTotal: new Prisma.Decimal(item.lineTotal.toString()).toFixed(DECIMAL_PLACES_MONEY),
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
      updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt,
      variant: item.variant
        ? {
            id: item.variant.id,
            name: item.variant.name,
            sku: item.variant.sku,
            barcode: item.variant.barcode,
            status: item.variant.status,
          }
        : undefined,
    };
  }

  private serializePurchaseOrder(po: any): PurchaseOrderResponse {
    return {
      id: po.id,
      purchaseOrderNumber: po.purchaseOrderNumber,
      supplierId: po.supplierId,
      destinationStoreId: po.destinationStoreId,
      status: po.status,
      currencyCode: po.currencyCode,
      subtotal: new Prisma.Decimal(po.subtotal.toString()).toFixed(DECIMAL_PLACES_MONEY),
      discountTotal: new Prisma.Decimal(po.discountTotal.toString()).toFixed(DECIMAL_PLACES_MONEY),
      taxTotal: new Prisma.Decimal(po.taxTotal.toString()).toFixed(DECIMAL_PLACES_MONEY),
      shippingTotal: new Prisma.Decimal(po.shippingTotal.toString()).toFixed(DECIMAL_PLACES_MONEY),
      grandTotal: new Prisma.Decimal(po.grandTotal.toString()).toFixed(DECIMAL_PLACES_MONEY),
      notes: po.notes,
      createdByUserId: po.createdByUserId,
      createdByUser: po.createdByUser
        ? { id: po.createdByUser.id, name: po.createdByUser.name, email: po.createdByUser.email }
        : null,
      approvedByUserId: po.approvedByUserId,
      approvedByUser: po.approvedByUser
        ? { id: po.approvedByUser.id, name: po.approvedByUser.name, email: po.approvedByUser.email }
        : null,
      approvedAt: po.approvedAt instanceof Date ? po.approvedAt.toISOString() : po.approvedAt,
      orderedAt: po.orderedAt instanceof Date ? po.orderedAt.toISOString() : po.orderedAt,
      expectedDeliveryAt:
        po.expectedDeliveryAt instanceof Date ? po.expectedDeliveryAt.toISOString() : po.expectedDeliveryAt,
      cancelledAt: po.cancelledAt instanceof Date ? po.cancelledAt.toISOString() : po.cancelledAt,
      createdAt: po.createdAt instanceof Date ? po.createdAt.toISOString() : po.createdAt,
      updatedAt: po.updatedAt instanceof Date ? po.updatedAt.toISOString() : po.updatedAt,
      supplier: po.supplier
        ? {
            id: po.supplier.id,
            name: po.supplier.name,
            code: po.supplier.code,
            status: po.supplier.status,
            email: po.supplier.email,
          }
        : undefined,
      destinationStore: po.destinationStore
        ? {
            id: po.destinationStore.id,
            name: po.destinationStore.name,
            code: po.destinationStore.code,
            status: po.destinationStore.status,
          }
        : undefined,
      items: (po.items || []).map((item: any) => this.serializeItem(item)),
      statusHistory: (po.statusHistory || []).map((h: any) => ({
        id: h.id,
        purchaseOrderId: h.purchaseOrderId,
        fromStatus: h.fromStatus,
        toStatus: h.toStatus,
        changedByUserId: h.changedByUserId,
        changedByUser: h.changedByUser
          ? { id: h.changedByUser.id, name: h.changedByUser.name, email: h.changedByUser.email }
          : null,
        reason: h.reason,
        createdAt: h.createdAt instanceof Date ? h.createdAt.toISOString() : h.createdAt,
      })),
      goodsReceiptsCount: po._count?.goodsReceipts ?? 0,
    };
  }

  // ============================================================================
  // Calculation Helper
  // ============================================================================

  private async calculateItemsAndTotals(
    supplierId: string,
    rawItems: CreatePurchaseOrderDto['items'],
    shippingTotalRaw: number | string | Prisma.Decimal = 0
  ) {
    if (!rawItems || rawItems.length === 0) {
      throw new EmptyPurchaseOrderItemsError();
    }

    let subtotal = new Prisma.Decimal(0);
    let discountTotal = new Prisma.Decimal(0);
    let taxTotal = new Prisma.Decimal(0);

    const calculatedItems = await Promise.all(
      rawItems.map(async itemDto => {
        // 1. Fetch variant and product
        const variant = await this.prisma.productVariant.findUnique({
          where: { id: itemDto.variantId },
          include: { product: true },
        });
        if (!variant) {
          throw new NotFoundError(`Product variant '${itemDto.variantId}' not found.`);
        }
        if (variant.status !== 'ACTIVE') {
          throw new BadRequestError(`Cannot add inactive variant '${variant.name}' to purchase order.`);
        }

        // 2. Fetch or match supplier product
        let supplierProduct = null;
        if (itemDto.supplierProductId) {
          supplierProduct = await this.prisma.supplierProduct.findUnique({
            where: { id: itemDto.supplierProductId },
          });
        } else {
          supplierProduct = await this.prisma.supplierProduct.findUnique({
            where: {
              uq_supplier_products_supplier_variant: {
                supplierId,
                variantId: itemDto.variantId,
              },
            },
          });
        }

        // 3. Determine unit price: explicitly provided > supplier product agreed price > cost price > 0
        let unitPrice: Prisma.Decimal;
        if (itemDto.unitPrice !== undefined) {
          unitPrice = new Prisma.Decimal(itemDto.unitPrice.toString());
        } else if (supplierProduct) {
          unitPrice = new Prisma.Decimal(supplierProduct.purchasePrice.toString());
        } else if (variant.costPrice) {
          unitPrice = new Prisma.Decimal(variant.costPrice.toString());
        } else {
          throw new BadRequestError(
            `Unit price required for variant '${variant.name}' as no supplier price is configured.`
          );
        }

        if (unitPrice.lessThan(0)) {
          throw new BadRequestError('Unit price must be non-negative.');
        }

        const qtyOrdered = new Prisma.Decimal(itemDto.quantityOrdered.toString());
        if (qtyOrdered.lessThanOrEqualTo(0)) {
          throw new BadRequestError('Ordered quantity must be greater than zero.');
        }

        const discountAmount = new Prisma.Decimal((itemDto.discountAmount ?? 0).toString());
        const taxRate = new Prisma.Decimal((itemDto.taxRate ?? 0).toString());

        // Line math: subtotal = qty * price; lineTotal = (subtotal - discount) * (1 + taxRate)
        const lineSubtotal = qtyOrdered.times(unitPrice);
        const taxableAmount = lineSubtotal.minus(discountAmount);
        const lineTax = taxableAmount.times(taxRate);
        const lineTotal = taxableAmount.plus(lineTax);

        subtotal = subtotal.plus(lineSubtotal);
        discountTotal = discountTotal.plus(discountAmount);
        taxTotal = taxTotal.plus(lineTax);

        return {
          variantId: itemDto.variantId,
          supplierProductId: supplierProduct?.id ?? null,
          skuSnapshot: variant.sku,
          productNameSnapshot: variant.name,
          supplierSkuSnapshot: supplierProduct?.supplierSku ?? null,
          quantityOrdered: qtyOrdered,
          quantityReceived: new Prisma.Decimal(0),
          unitPrice,
          discountAmount,
          taxRate,
          lineTotal,
        };
      })
    );

    const shippingTotal = new Prisma.Decimal(shippingTotalRaw.toString());
    const grandTotal = subtotal.minus(discountTotal).plus(taxTotal).plus(shippingTotal);

    return {
      items: calculatedItems,
      subtotal,
      discountTotal,
      taxTotal,
      shippingTotal,
      grandTotal,
    };
  }

  // ============================================================================
  // Lifecycle Workflows
  // ============================================================================

  async createPurchaseOrder(
    dto: CreatePurchaseOrderDto,
    creatorUserId?: string
  ): Promise<PurchaseOrderResponse> {
    // 1. Verify supplier is active
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, deletedAt: null },
    });
    if (!supplier) {
      throw new NotFoundError('Supplier not found.');
    }
    if (supplier.status !== 'ACTIVE') {
      throw new InactiveSupplierForOrderError();
    }

    // 2. Verify destination store is active
    const store = await this.prisma.store.findFirst({
      where: { id: dto.destinationStoreId, deletedAt: null },
    });
    if (!store) {
      throw new NotFoundError('Destination store not found.');
    }
    if (store.status !== 'ACTIVE') {
      throw new InactiveStoreForOrderError();
    }

    // 3. Compute item calculations and order totals
    const calculation = await this.calculateItemsAndTotals(
      dto.supplierId,
      dto.items,
      dto.shippingTotal ?? 0
    );

    return this.prisma.$transaction(async tx => {
      const poNumber = await this.repository.generatePoNumber(tx);

      const po = await this.repository.createPurchaseOrder(
        {
          purchaseOrderNumber: poNumber,
          supplierId: dto.supplierId,
          destinationStoreId: dto.destinationStoreId,
          status: 'DRAFT',
          currencyCode: dto.currencyCode?.toUpperCase() ?? 'USD',
          subtotal: calculation.subtotal,
          discountTotal: calculation.discountTotal,
          taxTotal: calculation.taxTotal,
          shippingTotal: calculation.shippingTotal,
          grandTotal: calculation.grandTotal,
          notes: dto.notes,
          createdByUserId: creatorUserId,
          expectedDeliveryAt: dto.expectedDeliveryAt ? new Date(dto.expectedDeliveryAt) : null,
        },
        calculation.items,
        tx
      );

      // Record initial creation in status history
      await this.repository.createStatusHistory(
        po.id,
        'DRAFT',
        'DRAFT',
        creatorUserId,
        'Initial purchase order creation',
        tx
      );

      return this.serializePurchaseOrder(po);
    });
  }

  async updatePurchaseOrder(
    id: string,
    dto: UpdatePurchaseOrderDto,
    _userId?: string
  ): Promise<PurchaseOrderResponse> {
    const po = await this.repository.findPurchaseOrderById(id);
    if (!po) {
      throw new PurchaseOrderNotFoundError();
    }

    if (!EDITABLE_PO_STATES.includes(po.status)) {
      throw new PurchaseOrderImmutableError(
        `Cannot edit purchase order in '${po.status}' status. Only DRAFT orders can be modified.`
      );
    }

    return this.prisma.$transaction(async tx => {
      let subtotal = po.subtotal;
      let discountTotal = po.discountTotal;
      let taxTotal = po.taxTotal;
      let shippingTotal = dto.shippingTotal !== undefined
        ? new Prisma.Decimal(dto.shippingTotal.toString())
        : po.shippingTotal;
      let grandTotal = po.grandTotal;

      if (dto.items && dto.items.length > 0) {
        const calculation = await this.calculateItemsAndTotals(
          po.supplierId,
          dto.items,
          shippingTotal
        );
        subtotal = calculation.subtotal;
        discountTotal = calculation.discountTotal;
        taxTotal = calculation.taxTotal;
        shippingTotal = calculation.shippingTotal;
        grandTotal = calculation.grandTotal;

        // Replace items
        await this.repository.deletePurchaseOrderItems(id, tx);
        await tx.purchaseOrderItem.createMany({
          data: calculation.items.map(item => ({
            ...item,
            purchaseOrderId: id,
          })),
        });
      } else if (dto.shippingTotal !== undefined) {
        grandTotal = new Prisma.Decimal(po.subtotal.toString())
          .minus(po.discountTotal.toString())
          .plus(po.taxTotal.toString())
          .plus(shippingTotal);
      }

      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          subtotal,
          discountTotal,
          taxTotal,
          shippingTotal,
          grandTotal,
          ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
          ...(dto.expectedDeliveryAt !== undefined
            ? { expectedDeliveryAt: dto.expectedDeliveryAt ? new Date(dto.expectedDeliveryAt) : null }
            : {}),
        },
        include: {
          supplier: true,
          destinationStore: true,
          items: { include: { variant: true } },
          statusHistory: { orderBy: { createdAt: 'desc' } },
        },
      });

      return this.serializePurchaseOrder(updated);
    });
  }

  async submitForApproval(id: string, userId?: string): Promise<PurchaseOrderResponse> {
    const po = await this.repository.findPurchaseOrderById(id);
    if (!po) {
      throw new PurchaseOrderNotFoundError();
    }

    if (po.status !== 'DRAFT') {
      throw new InvalidPurchaseOrderStateError(
        `Only DRAFT orders can be submitted for approval (current state: ${po.status}).`
      );
    }

    return this.prisma.$transaction(async tx => {
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: { status: 'PENDING_APPROVAL' },
        include: {
          supplier: true,
          destinationStore: true,
          items: { include: { variant: true } },
          statusHistory: { orderBy: { createdAt: 'desc' } },
        },
      });

      await this.repository.createStatusHistory(
        id,
        'DRAFT',
        'PENDING_APPROVAL',
        userId,
        'Submitted for management approval',
        tx
      );

      return this.serializePurchaseOrder(updated);
    });
  }

  async approvePurchaseOrder(
    id: string,
    dto: ApprovePurchaseOrderDto,
    userId?: string,
    userRoles: string[] = []
  ): Promise<PurchaseOrderResponse> {
    const po = await this.repository.findPurchaseOrderById(id);
    if (!po) {
      throw new PurchaseOrderNotFoundError();
    }

    if (po.status !== 'PENDING_APPROVAL' && po.status !== 'DRAFT') {
      throw new InvalidPurchaseOrderStateError(
        `Cannot approve purchase order in '${po.status}' state.`
      );
    }

    // Separation of duties enforcement:
    // Creator cannot approve their own order unless SUPER_ADMIN
    if (po.createdByUserId && po.createdByUserId === userId && !userRoles.includes('SUPER_ADMIN')) {
      throw new SeparationOfDutiesError();
    }

    const fromStatus = po.status;

    return this.prisma.$transaction(async tx => {
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedByUserId: userId,
          approvedAt: new Date(),
        },
        include: {
          supplier: true,
          destinationStore: true,
          items: { include: { variant: true } },
          statusHistory: { orderBy: { createdAt: 'desc' } },
        },
      });

      await this.repository.createStatusHistory(
        id,
        fromStatus,
        'APPROVED',
        userId,
        dto.notes || 'Purchase order approved by manager',
        tx
      );

      return this.serializePurchaseOrder(updated);
    });
  }

  async markOrdered(id: string, userId?: string): Promise<PurchaseOrderResponse> {
    const po = await this.repository.findPurchaseOrderById(id);
    if (!po) {
      throw new PurchaseOrderNotFoundError();
    }

    if (po.status !== 'APPROVED') {
      throw new InvalidPurchaseOrderStateError(
        `Only APPROVED purchase orders can be placed with vendor (current status: ${po.status}).`
      );
    }

    return this.prisma.$transaction(async tx => {
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: 'ORDERED',
          orderedAt: new Date(),
        },
        include: {
          supplier: true,
          destinationStore: true,
          items: { include: { variant: true } },
          statusHistory: { orderBy: { createdAt: 'desc' } },
        },
      });

      await this.repository.createStatusHistory(
        id,
        'APPROVED',
        'ORDERED',
        userId,
        'Purchase order transmitted to vendor',
        tx
      );

      return this.serializePurchaseOrder(updated);
    });
  }

  async cancelPurchaseOrder(
    id: string,
    dto: CancelPurchaseOrderDto,
    userId?: string
  ): Promise<PurchaseOrderResponse> {
    const po = await this.repository.findPurchaseOrderById(id);
    if (!po) {
      throw new PurchaseOrderNotFoundError();
    }

    if (!CANCELLABLE_PO_STATES.includes(po.status)) {
      throw new InvalidPurchaseOrderStateError(
        `Cannot cancel purchase order in '${po.status}' state.`
      );
    }

    // If order was already placed, verify no physical goods were received
    if (po.status === 'ORDERED' || po.status === 'PARTIALLY_RECEIVED') {
      const totalReceived = po.items.reduce(
        (sum, item) => sum.plus(new Prisma.Decimal(item.quantityReceived.toString())),
        new Prisma.Decimal(0)
      );
      if (totalReceived.greaterThan(0)) {
        throw new InvalidPurchaseOrderStateError(
          'Cannot cancel purchase order where delivery of goods has already occurred.'
        );
      }
    }

    const fromStatus = po.status;

    return this.prisma.$transaction(async tx => {
      const updated = await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
        },
        include: {
          supplier: true,
          destinationStore: true,
          items: { include: { variant: true } },
          statusHistory: { orderBy: { createdAt: 'desc' } },
        },
      });

      await this.repository.createStatusHistory(
        id,
        fromStatus,
        'CANCELLED',
        userId,
        dto.reason,
        tx
      );

      return this.serializePurchaseOrder(updated);
    });
  }

  async getPurchaseOrderById(id: string): Promise<PurchaseOrderResponse> {
    const po = await this.repository.findPurchaseOrderById(id);
    if (!po) {
      throw new PurchaseOrderNotFoundError();
    }
    return this.serializePurchaseOrder(po);
  }

  async listPurchaseOrders(query: PurchaseOrderQueryDto) {
    const result = await this.repository.listPurchaseOrders(query);
    return {
      items: result.items.map(po => this.serializePurchaseOrder(po)),
      meta: result.meta,
    };
  }
}
