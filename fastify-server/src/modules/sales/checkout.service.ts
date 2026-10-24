import { Prisma, type PrismaClient } from '@prisma/client';
import { SaleRepository, type PrismaTransactionClient } from './sale.repository.js';
import { InventoryRepository } from '../inventory/inventory.repository.js';
import { ReceiptService } from './receipt.service.js';
import {
  SaleInsufficientStockError,
  SaleItemInvalidError,
  SaleCurrencyMismatchError,
} from './sale.errors.js';
import type {
  DirectCheckoutDto,
  SaleResponseDto,
  SaleItemResponseDto,
} from './sale.types.js';
import { DEFAULT_CURRENCY, DEFAULT_TAX_RATE } from './sale.constants.js';

export class CheckoutService {
  private readonly saleRepo: SaleRepository;
  private readonly inventoryRepo: InventoryRepository;
  private readonly receiptService: ReceiptService;

  constructor(private readonly prisma: PrismaClient) {
    this.saleRepo = new SaleRepository(prisma);
    this.inventoryRepo = new InventoryRepository(prisma);
    this.receiptService = new ReceiptService(prisma);
  }

  /**
   * Executes an atomic checkout workflow:
   * 1. Validates authoritative catalog data, positive quantities, and currency.
   * 2. Calculates exact decimal line totals, taxes, discounts, and grand total.
   * 3. Locks inventory rows in sorted variant order to prevent deadlocks.
   * 4. Validates stock availability and deducts inventory balance.
   * 5. Records immutable audit movements with reference to the sale.
   * 6. Creates the Sale, SaleItems, and optional Payment & Receipt within the transaction.
   */
  async processDirectCheckout(
    cashierUserId: string,
    dto: DirectCheckoutDto
  ): Promise<SaleResponseDto> {
    // 1. Idempotency check
    if (dto.idempotencyKey) {
      const existingSale = await this.saleRepo.findSaleByIdempotencyKey(dto.idempotencyKey);
      if (existingSale) {
        return this.mapToResponseDto(existingSale);
      }
    }

    const currencyCode = (dto.currencyCode ?? DEFAULT_CURRENCY).toUpperCase();

    // 2. Fetch authoritative catalog information for all requested variants
    const variantIds = Array.from(new Set(dto.items.map(item => item.variantId)));
    const variants = await this.prisma.productVariant.findMany({
      where: {
        id: { in: variantIds },
      },
      include: {
        product: true,
      },
    });

    if (variants.length !== variantIds.length) {
      const foundIds = new Set(variants.map(v => v.id));
      const missingId = variantIds.find(id => !foundIds.has(id));
      throw new SaleItemInvalidError(`Product variant '${missingId}' does not exist.`);
    }

    // Verify variants and parent products are active and eligible for sale
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

    // Aggregate quantities per variant in case the cart contains multiple entries for the same SKU
    const aggregatedQuantities = new Map<string, Prisma.Decimal>();
    for (const item of dto.items) {
      const current = aggregatedQuantities.get(item.variantId) ?? new Prisma.Decimal('0.0000');
      aggregatedQuantities.set(
        item.variantId,
        current.add(new Prisma.Decimal(item.quantity.toString()))
      );
    }

    // 3. Server-side authoritative pricing calculations
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

      // Calculate line totals
      const grossLine = unitPrice.mul(quantity);
      if (discountAmount.gt(grossLine)) {
        throw new SaleItemInvalidError(
          `Discount for SKU '${variant.sku}' cannot exceed line item total.`
        );
      }

      const netLine = grossLine.sub(discountAmount);
      // For standard catalog items, tax rate snapshot
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

    // 4. Validate payment if paying with cash
    let changeDue: string | undefined;
    let paymentAmountPaid = new Prisma.Decimal('0.00');
    if (dto.paymentMethod === 'CASH') {
      const tendered = dto.amountTendered
        ? new Prisma.Decimal(dto.amountTendered.toString())
        : grandTotal;

      if (tendered.lt(grandTotal)) {
        throw new SaleItemInvalidError(
          `Cash tendered (${tendered.toString()}) is less than the grand total (${grandTotal.toString()}).`
        );
      }
      changeDue = tendered.sub(grandTotal).toFixed(2);
      paymentAmountPaid = grandTotal;
    }

    // 5. Execute database transaction with inventory locking and deduction
    const result = await this.prisma.$transaction(
      async tx => {
        // Safe sequence generation for sale number
        const saleNumber = await this.saleRepo.generateSaleNumber(tx);

        // Deadlock prevention: sort variantIds deterministically before acquiring row-level locks
        const sortedVariantIds = Array.from(aggregatedQuantities.keys()).sort();

        for (const variantId of sortedVariantIds) {
          const qtyRequired = aggregatedQuantities.get(variantId)!;
          const balance = await this.inventoryRepo.findBalanceForUpdate(dto.storeId, variantId, tx);

          if (!balance) {
            const variant = variantMap.get(variantId)!;
            throw new SaleInsufficientStockError(variant.sku, qtyRequired.toString(), '0.0000');
          }

          const available = balance.quantity_on_hand.sub(balance.quantity_reserved);
          if (available.lt(qtyRequired)) {
            const variant = variantMap.get(variantId)!;
            throw new SaleInsufficientStockError(
              variant.sku,
              qtyRequired.toString(),
              available.toString()
            );
          }

          // Deduct inventory balance
          const newOnHand = balance.quantity_on_hand.sub(qtyRequired);
          await this.inventoryRepo.updateBalance(
            balance.id,
            { quantityOnHand: newOnHand },
            tx
          );

          // Append immutable audit ledger movement
          await this.inventoryRepo.createMovement(
            {
              storeId: dto.storeId,
              variantId,
              movementType: 'SALE',
              quantityDelta: qtyRequired.negated(),
              quantityBefore: balance.quantity_on_hand,
              quantityAfter: newOnHand,
              referenceType: 'SALE',
              referenceId: saleNumber,
              performedByUserId: cashierUserId,
              reason: 'Point of sale checkout fulfillment',
            },
            tx
          );
        }

        // Determine sale status based on payment settlement
        const isSettled = dto.paymentMethod === 'CASH' && paymentAmountPaid.gte(grandTotal);
        const saleStatus = isSettled ? 'COMPLETED' : 'PENDING_PAYMENT';
        const completedAt = isSettled ? new Date() : null;

        // Create Sale and SaleItems
        const sale = await tx.sale.create({
          data: {
            saleNumber,
            storeId: dto.storeId,
            status: saleStatus,
            currencyCode,
            subtotal,
            discountTotal,
            taxTotal,
            grandTotal,
            amountPaid: paymentAmountPaid,
            amountRefunded: new Prisma.Decimal('0.00'),
            cashierUserId,
            idempotencyKey: dto.idempotencyKey ?? null,
            notes: dto.notes ?? null,
            completedAt,
            items: {
              create: calculatedItems.map(item => ({
                variantId: item.variantId,
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
          },
          include: {
            items: true,
            store: { select: { id: true, name: true, code: true, addressLine1: true, city: true, state: true, phone: true } },
            cashierUser: { select: { id: true, name: true, email: true } },
          },
        });

        // If paid with cash, record payment and generate receipt
        if (isSettled) {
          const paymentRefSeq = await tx.$queryRaw<Array<{ nextval: bigint | number | string }>>`
            SELECT nextval('payment_ref_seq') as nextval
          `;
          const paymentRefVal = paymentRefSeq[0]?.nextval?.toString() ?? Math.floor(1000 + Math.random() * 9000).toString();
          const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const paymentReference = `PAY-${dateStr}-${paymentRefVal.padStart(4, '0')}`;

          await tx.payment.create({
            data: {
              saleId: sale.id,
              paymentReference,
              paymentMethod: 'CASH',
              status: 'CAPTURED',
              amount: grandTotal,
              currencyCode,
              provider: 'CASH',
              capturedAt: new Date(),
            },
          });

          // Generate receipt immediately for completed cash sale
          await this.receiptService.generateReceiptForSale(sale.id, tx);
        }

        return sale;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        timeout: 10000,
      }
    );

    // Fetch complete representation including payments and receipt
    const finalSale = await this.saleRepo.findSaleById(result.id);
    const responseDto = this.mapToResponseDto(finalSale!);
    if (changeDue !== undefined) {
      responseDto.changeDue = changeDue;
    }
    return responseDto;
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
