import { Prisma, type PrismaClient } from '@prisma/client';
import { SaleRepository } from './sale.repository.js';
import { InventoryRepository } from '../inventory/inventory.repository.js';
import {
  SaleNotFoundError,
  SaleInvalidStateTransitionError,
  SaleAlreadyCompletedError,
  SaleItemInvalidError,
  SaleCurrencyMismatchError,
} from './sale.errors.js';
import type {
  CreateSaleDto,
  SaleQueryDto,
  SaleResponseDto,
  SaleItemResponseDto,
} from './sale.types.js';
import { DEFAULT_CURRENCY, DEFAULT_TAX_RATE, isValidSaleTransition } from './sale.constants.js';

export class SaleService {
  private readonly saleRepo: SaleRepository;
  private readonly inventoryRepo: InventoryRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.saleRepo = new SaleRepository(prisma);
    this.inventoryRepo = new InventoryRepository(prisma);
  }

  /**
   * Creates a new Sale in DRAFT or PENDING_PAYMENT status with server-calculated line totals.
   */
  async createSale(
    cashierUserId: string,
    dto: CreateSaleDto
  ): Promise<SaleResponseDto> {
    if (dto.idempotencyKey) {
      const existing = await this.saleRepo.findSaleByIdempotencyKey(dto.idempotencyKey);
      if (existing) {
        return this.mapToResponseDto(existing);
      }
    }

    const currencyCode = (dto.currencyCode ?? DEFAULT_CURRENCY).toUpperCase();

    // Fetch authoritative variant data
    const variantIds = Array.from(new Set(dto.items.map(item => item.variantId)));
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      include: { product: true },
    });

    if (variants.length !== variantIds.length) {
      const foundIds = new Set(variants.map(v => v.id));
      const missingId = variantIds.find(id => !foundIds.has(id));
      throw new SaleItemInvalidError(`Product variant '${missingId}' does not exist.`);
    }

    const variantMap = new Map(variants.map(v => [v.id, v]));
    for (const item of dto.items) {
      const variant = variantMap.get(item.variantId)!;
      if (variant.status !== 'ACTIVE') {
        throw new SaleItemInvalidError(`Variant '${variant.sku}' is not active for sale.`);
      }
      if (variant.product.status !== 'ACTIVE' || variant.product.deletedAt !== null) {
        throw new SaleItemInvalidError(
          `Product '${variant.product.name}' is inactive or deleted and cannot be sold.`
        );
      }
      if (variant.currency.toUpperCase() !== currencyCode) {
        throw new SaleCurrencyMismatchError(currencyCode, variant.currency);
      }
      const qty = new Prisma.Decimal(item.quantity.toString());
      if (qty.lte(0)) {
        throw new SaleItemInvalidError(`Quantity for SKU '${variant.sku}' must be strictly positive.`);
      }
    }

    let subtotal = new Prisma.Decimal('0.00');
    let discountTotal = new Prisma.Decimal('0.00');
    let taxTotal = new Prisma.Decimal('0.00');

    const calculatedItems = dto.items.map(item => {
      const variant = variantMap.get(item.variantId)!;
      const quantity = new Prisma.Decimal(item.quantity.toString());
      const unitPrice = variant.price;
      const discountAmount = new Prisma.Decimal(item.discountAmount?.toString() ?? '0.00');

      if (discountAmount.lt(0)) {
        throw new SaleItemInvalidError(`Discount for SKU '${variant.sku}' cannot be negative.`);
      }

      const grossLine = unitPrice.mul(quantity);
      if (discountAmount.gt(grossLine)) {
        throw new SaleItemInvalidError(
          `Discount for SKU '${variant.sku}' cannot exceed line item total.`
        );
      }

      const netLine = grossLine.sub(discountAmount);
      const taxRate = DEFAULT_TAX_RATE;
      const taxAmount = netLine.mul(taxRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const lineTotal = netLine.add(taxAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      subtotal = subtotal.add(grossLine);
      discountTotal = discountTotal.add(discountAmount);
      taxTotal = taxTotal.add(taxAmount);

      return {
        variantId: variant.id,
        skuSnapshot: variant.sku,
        productNameSnapshot: variant.product.name,
        variantNameSnapshot: variant.name,
        quantity,
        unitPrice,
        discountAmount,
        taxRate,
        taxAmount,
        lineTotal,
      };
    });

    const grandTotal = subtotal
      .sub(discountTotal)
      .add(taxTotal)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    const saleNumber = await this.saleRepo.generateSaleNumber();

    const created = await this.saleRepo.createSale({
      saleNumber,
      store: { connect: { id: dto.storeId } },
      status: 'DRAFT',
      currencyCode,
      subtotal,
      discountTotal,
      taxTotal,
      grandTotal,
      amountPaid: new Prisma.Decimal('0.00'),
      amountRefunded: new Prisma.Decimal('0.00'),
      cashierUser: { connect: { id: cashierUserId } },
      idempotencyKey: dto.idempotencyKey ?? null,
      notes: dto.notes ?? null,
      items: {
        create: calculatedItems.map(item => ({
          variant: { connect: { id: item.variantId } },
          skuSnapshot: item.skuSnapshot,
          productNameSnapshot: item.productNameSnapshot,
          variantNameSnapshot: item.variantNameSnapshot,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount,
          taxRate: item.taxRate,
          taxAmount: item.taxAmount,
          lineTotal: item.lineTotal,
        })),
      },
    });

    return this.mapToResponseDto(created);
  }

  /**
   * Retrieves sale details by ID.
   */
  async getSaleById(id: string): Promise<SaleResponseDto> {
    const sale = await this.saleRepo.findSaleById(id);
    if (!sale) {
      throw new SaleNotFoundError(id);
    }
    return this.mapToResponseDto(sale);
  }

  /**
   * Lists sales with filtering and pagination.
   */
  async listSales(query: SaleQueryDto): Promise<{
    items: SaleResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const { items, total } = await this.saleRepo.listSales(query, skip, limit);

    return {
      items: items.map(s => this.mapToResponseDto(s)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Cancels an in-progress sale (DRAFT or PENDING_PAYMENT).
   * Captured sales cannot be cancelled directly; they must undergo a refund workflow.
   */
  async cancelSale(
    saleId: string,
    userId: string,
    reason: string
  ): Promise<SaleResponseDto> {
    return this.prisma.$transaction(async tx => {
      const sale = await this.saleRepo.findSaleById(saleId, tx);
      if (!sale) {
        throw new SaleNotFoundError(saleId);
      }

      if (sale.status === 'COMPLETED') {
        throw new SaleAlreadyCompletedError(sale.saleNumber);
      }

      if (!isValidSaleTransition(sale.status, 'CANCELLED')) {
        throw new SaleInvalidStateTransitionError(sale.status, 'CANCELLED');
      }

      // If stock was reserved or deducted prior to completion, release it
      // Note: In DirectCheckout, stock is deducted atomically at checkout completion.
      // If a pending sale had deducted stock, we restore it here:
      if (sale.status === 'PENDING_PAYMENT') {
        for (const item of sale.items) {
          const balance = await this.inventoryRepo.findBalanceForUpdate(
            sale.storeId,
            item.variantId,
            tx
          );
          if (balance) {
            const restoredOnHand = balance.quantity_on_hand.add(item.quantity);
            await this.inventoryRepo.updateBalance(
              balance.id,
              { quantityOnHand: restoredOnHand },
              tx
            );
            await this.inventoryRepo.createMovement(
              {
                storeId: sale.storeId,
                variantId: item.variantId,
                movementType: 'RETURN',
                quantityDelta: item.quantity,
                quantityBefore: balance.quantity_on_hand,
                quantityAfter: restoredOnHand,
                referenceType: 'SALE_CANCEL',
                referenceId: sale.saleNumber,
                performedByUserId: userId,
                reason: `Sale cancelled: ${reason}`,
              },
              tx
            );
          }
        }
      }

      const updated = await this.saleRepo.updateSale(
        sale.id,
        {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          notes: sale.notes
            ? `${sale.notes}\n[Cancelled]: ${reason}`
            : `[Cancelled]: ${reason}`,
        },
        tx
      );

      return this.mapToResponseDto(updated);
    });
  }

  private mapToResponseDto(sale: any): SaleResponseDto {
    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      storeId: sale.storeId,
      status: sale.status,
      currencyCode: sale.currencyCode,
      subtotal: sale.subtotal.toString(),
      discountTotal: sale.discountTotal.toString(),
      taxTotal: sale.taxTotal.toString(),
      grandTotal: sale.grandTotal.toString(),
      amountPaid: sale.amountPaid.toString(),
      amountRefunded: sale.amountRefunded.toString(),
      cashierUserId: sale.cashierUserId,
      idempotencyKey: sale.idempotencyKey,
      notes: sale.notes,
      completedAt: sale.completedAt ? sale.completedAt.toISOString() : null,
      cancelledAt: sale.cancelledAt ? sale.cancelledAt.toISOString() : null,
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
      items: sale.items?.map((item: any): SaleItemResponseDto => ({
        id: item.id,
        saleId: item.saleId,
        variantId: item.variantId,
        skuSnapshot: item.skuSnapshot,
        productNameSnapshot: item.productNameSnapshot,
        variantNameSnapshot: item.variantNameSnapshot,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        discountAmount: item.discountAmount.toString(),
        taxRate: item.taxRate.toString(),
        taxAmount: item.taxAmount.toString(),
        lineTotal: item.lineTotal.toString(),
        createdAt: item.createdAt.toISOString(),
      })),
      payments: sale.payments?.map((p: any) => ({
        id: p.id,
        paymentReference: p.paymentReference,
        paymentMethod: p.paymentMethod,
        status: p.status,
        amount: p.amount.toString(),
        currencyCode: p.currencyCode,
        provider: p.provider,
        capturedAt: p.capturedAt ? p.capturedAt.toISOString() : null,
      })),
      refunds: sale.refunds?.map((r: any) => ({
        id: r.id,
        refundReference: r.refundReference,
        amount: r.amount.toString(),
        currencyCode: r.currencyCode,
        status: r.status,
        reason: r.reason,
        processedAt: r.processedAt ? r.processedAt.toISOString() : null,
      })),
      receipt: sale.receipt
        ? {
            id: sale.receipt.id,
            receiptNumber: sale.receipt.receiptNumber,
            issuedAt: sale.receipt.issuedAt.toISOString(),
          }
        : null,
    };
  }
}
