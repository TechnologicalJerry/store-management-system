import { type PrismaClient } from '@prisma/client';
import { SaleRepository, type PrismaTransactionClient } from './sale.repository.js';
import { ReceiptNotFoundError, SaleNotFoundError } from './sale.errors.js';
import type { ReceiptResponseDto, ReceiptDataSnapshot } from './sale.types.js';
import { AppError } from '../../common/errors/app-error.js';

export class ReceiptService {
  private readonly saleRepo: SaleRepository;

  constructor(private readonly prisma: PrismaClient) {
    this.saleRepo = new SaleRepository(prisma);
  }

  /**
   * Generates and persists an immutable customer receipt for a completed sale.
   */
  async generateReceiptForSale(
    saleId: string,
    tx?: PrismaTransactionClient
  ): Promise<ReceiptResponseDto> {
    const sale = await this.saleRepo.findSaleById(saleId, tx);
    if (!sale) {
      throw new SaleNotFoundError(saleId);
    }

    if (sale.status !== 'COMPLETED' && sale.status !== 'PARTIALLY_REFUNDED' && sale.status !== 'REFUNDED') {
      throw new AppError(
        `Receipt cannot be issued for a sale with status '${sale.status}'. Sale must be COMPLETED.`,
        400,
        'RECEIPT_NOT_AVAILABLE'
      );
    }

    // Idempotent: return existing receipt if already generated
    const existingReceipt = await this.saleRepo.findReceiptBySaleId(saleId, tx);
    if (existingReceipt) {
      return this.mapToResponseDto(existingReceipt);
    }

    const receiptNumber = await this.saleRepo.generateReceiptNumber(tx);
    const cashierName = sale.cashierUser?.name ?? 'System Cashier';

    const receiptData: ReceiptDataSnapshot = {
      saleNumber: sale.saleNumber,
      receiptNumber,
      issuedAt: new Date().toISOString(),
      store: {
        id: sale.store.id,
        name: sale.store.name,
        code: sale.store.code,
        addressLine1: sale.store.addressLine1,
        city: sale.store.city,
        state: sale.store.state,
        phone: sale.store.phone,
      },
      cashier: {
        id: sale.cashierUserId,
        name: cashierName,
      },
      items: sale.items.map(item => ({
        sku: item.skuSnapshot,
        name: item.productNameSnapshot,
        variantName: item.variantNameSnapshot,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        discountAmount: item.discountAmount.toString(),
        taxAmount: item.taxAmount.toString(),
        lineTotal: item.lineTotal.toString(),
      })),
      financialSummary: {
        subtotal: sale.subtotal.toString(),
        discountTotal: sale.discountTotal.toString(),
        taxTotal: sale.taxTotal.toString(),
        grandTotal: sale.grandTotal.toString(),
        amountPaid: sale.amountPaid.toString(),
        amountRefunded: sale.amountRefunded.toString(),
        currencyCode: sale.currencyCode,
      },
      payments: sale.payments.map(p => ({
        reference: p.paymentReference,
        method: p.paymentMethod,
        amount: p.amount.toString(),
        status: p.status,
        provider: p.provider,
      })),
    };

    const receipt = await this.saleRepo.createReceipt(
      {
        receiptNumber,
        storeNameSnapshot: sale.store.name,
        storeAddressSnapshot: [sale.store.addressLine1, sale.store.city, sale.store.state]
          .filter(Boolean)
          .join(', ') || null,
        cashierNameSnapshot: cashierName,
        receiptData: receiptData as any,
        sale: { connect: { id: sale.id } },
        store: { connect: { id: sale.storeId } },
      },
      tx
    );

    return this.mapToResponseDto(receipt);
  }

  /**
   * Retrieves a receipt by its unique receiptId.
   */
  async getReceiptById(receiptId: string): Promise<ReceiptResponseDto> {
    const receipt = await this.saleRepo.findReceiptById(receiptId);
    if (!receipt) {
      throw new ReceiptNotFoundError(receiptId);
    }
    return this.mapToResponseDto(receipt);
  }

  /**
   * Retrieves a receipt for a given saleId.
   */
  async getReceiptBySaleId(saleId: string): Promise<ReceiptResponseDto> {
    const receipt = await this.saleRepo.findReceiptBySaleId(saleId);
    if (!receipt) {
      throw new ReceiptNotFoundError(`saleId: ${saleId}`);
    }
    return this.mapToResponseDto(receipt);
  }

  private mapToResponseDto(receipt: any): ReceiptResponseDto {
    return {
      id: receipt.id,
      receiptNumber: receipt.receiptNumber,
      saleId: receipt.saleId,
      storeId: receipt.storeId,
      storeNameSnapshot: receipt.storeNameSnapshot,
      storeAddressSnapshot: receipt.storeAddressSnapshot,
      cashierNameSnapshot: receipt.cashierNameSnapshot,
      receiptData: receipt.receiptData,
      issuedAt: receipt.issuedAt.toISOString(),
      createdAt: receipt.createdAt.toISOString(),
    };
  }
}
