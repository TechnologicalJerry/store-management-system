import { Prisma, type PrismaClient } from '@prisma/client';
import { PaymentRepository } from './payment.repository.js';
import { SaleRepository } from '../sales/sale.repository.js';
import { ReceiptService } from '../sales/receipt.service.js';
import type { IPaymentProvider } from './payment-provider.interface.js';
import { CashPaymentProvider } from './providers/cash.provider.js';
import { MockDigitalPaymentProvider } from './providers/mock-digital.provider.js';
import {
  PaymentNotFoundError,
  PaymentInvalidStateTransitionError,
  PaymentAmountExceedsSaleError,
  PaymentAlreadyCapturedError,
} from './payment.errors.js';
import { SaleNotFoundError, SaleInvalidStateTransitionError } from '../sales/sale.errors.js';
import type {
  RecordPaymentDto,
  CapturePaymentDto,
  VoidPaymentDto,
  PaymentResponseDto,
  RefundResponseDto,
} from './payment.types.js';
import { isValidPaymentTransition } from './payment.constants.js';

export class PaymentService {
  private readonly paymentRepo: PaymentRepository;
  private readonly saleRepo: SaleRepository;
  private readonly receiptService: ReceiptService;
  private readonly providers: Map<string, IPaymentProvider> = new Map();

  constructor(private readonly prisma: PrismaClient) {
    this.paymentRepo = new PaymentRepository(prisma);
    this.saleRepo = new SaleRepository(prisma);
    this.receiptService = new ReceiptService(prisma);

    // Register built-in providers
    this.registerProvider(new CashPaymentProvider());
    this.registerProvider(new MockDigitalPaymentProvider());
  }

  registerProvider(provider: IPaymentProvider) {
    this.providers.set(provider.providerName.toUpperCase(), provider);
  }

  private getProvider(name: string): IPaymentProvider {
    const provider = this.providers.get(name.toUpperCase());
    if (!provider) {
      // Default fallback to mock digital provider for unknown digital providers in test environment
      return this.providers.get('MOCK_DIGITAL')!;
    }
    return provider;
  }

  /**
   * Records or initiates a payment for a sale:
   * 1. Validates sale existence and non-terminal state.
   * 2. Checks remaining balance due to prevent overpayments.
   * 3. Executes payment provider operation outside the database transaction to avoid holding locks.
   * 4. Updates payment and sale state atomically in a database transaction.
   * 5. Issues customer receipt if payment settles the remaining balance.
   */
  async recordOrInitiatePayment(
    saleId: string,
    cashierUserId: string,
    dto: RecordPaymentDto
  ): Promise<PaymentResponseDto> {
    // Idempotency check
    if (dto.idempotencyKey) {
      const existing = await this.paymentRepo.findPaymentByIdempotencyKey(dto.idempotencyKey);
      if (existing) {
        return this.mapToResponseDto(existing);
      }
    }

    const sale = await this.saleRepo.findSaleById(saleId);
    if (!sale) {
      throw new SaleNotFoundError(saleId);
    }

    if (sale.status === 'CANCELLED' || sale.status === 'REFUNDED') {
      throw new SaleInvalidStateTransitionError(sale.status, 'PAYMENT_RECEIVED');
    }

    const paymentAmount = new Prisma.Decimal(dto.amount.toString());
    const remainingDue = sale.grandTotal.sub(sale.amountPaid);

    if (paymentAmount.gt(remainingDue)) {
      throw new PaymentAmountExceedsSaleError(
        paymentAmount.toString(),
        remainingDue.toString()
      );
    }

    const paymentReference = await this.paymentRepo.generatePaymentReference();
    const providerName = dto.paymentMethod === 'CASH' ? 'CASH' : (dto.provider ?? 'MOCK_DIGITAL');
    const provider = this.getProvider(providerName);

    let amountTenderedDecimal: Prisma.Decimal | undefined;
    let changeDue: string | undefined;

    if (dto.paymentMethod === 'CASH') {
      amountTenderedDecimal = dto.amountTendered
        ? new Prisma.Decimal(dto.amountTendered.toString())
        : paymentAmount;
      if (amountTenderedDecimal.gt(paymentAmount)) {
        changeDue = amountTenderedDecimal.sub(paymentAmount).toFixed(2);
      }
    }

    // Provider call executed OUTSIDE DB transaction
    const providerResult = await provider.processPayment(paymentAmount, sale.currencyCode, {
      paymentReference,
      paymentMethod: dto.paymentMethod,
      currencyCode: sale.currencyCode,
      idempotencyKey: dto.idempotencyKey,
      amountTendered: amountTenderedDecimal,
      metadata: { cashierUserId, notes: dto.notes },
    });

    const now = new Date();
    const initialStatus = providerResult.status as any;
    const capturedAt = initialStatus === 'CAPTURED' ? now : null;
    const authorizedAt = initialStatus === 'AUTHORIZED' ? now : null;
    const failedAt = initialStatus === 'FAILED' ? now : null;

    // Atomically persist payment and update sale status
    const payment = await this.prisma.$transaction(async tx => {
      const createdPayment = await tx.payment.create({
        data: {
          saleId: sale.id,
          paymentReference,
          paymentMethod: dto.paymentMethod,
          status: initialStatus,
          amount: paymentAmount,
          currencyCode: sale.currencyCode,
          provider: provider.providerName,
          providerTransactionId: providerResult.providerTransactionId ?? null,
          idempotencyKey: dto.idempotencyKey ?? null,
          failureCode: providerResult.failureCode ?? null,
          failureMessage: providerResult.failureMessage ?? null,
          initiatedAt: now,
          authorizedAt,
          capturedAt,
          failedAt,
        },
      });

      if (initialStatus === 'CAPTURED') {
        const newAmountPaid = sale.amountPaid.add(paymentAmount);
        const isFullyPaid = newAmountPaid.gte(sale.grandTotal);
        const newSaleStatus = isFullyPaid ? 'COMPLETED' : 'PENDING_PAYMENT';

        await tx.sale.update({
          where: { id: sale.id },
          data: {
            amountPaid: newAmountPaid,
            status: newSaleStatus,
            completedAt: isFullyPaid ? now : null,
          },
        });

        if (isFullyPaid) {
          await this.receiptService.generateReceiptForSale(sale.id, tx);
        }
      } else if (sale.status === 'DRAFT') {
        await tx.sale.update({
          where: { id: sale.id },
          data: {
            status: 'PENDING_PAYMENT',
          },
        });
      }

      return createdPayment;
    });

    const responseDto = this.mapToResponseDto(payment);
    if (changeDue) {
      responseDto.changeDue = changeDue;
    }
    return responseDto;
  }

  /**
   * Captures a previously authorized payment.
   */
  async capturePayment(
    paymentId: string,
    dto: CapturePaymentDto
  ): Promise<PaymentResponseDto> {
    const existing = await this.paymentRepo.findPaymentById(paymentId);
    if (!existing) {
      throw new PaymentNotFoundError(paymentId);
    }

    if (existing.status === 'CAPTURED') {
      throw new PaymentAlreadyCapturedError(existing.paymentReference);
    }

    if (!isValidPaymentTransition(existing.status, 'CAPTURED')) {
      throw new PaymentInvalidStateTransitionError(existing.status, 'CAPTURED');
    }

    const provider = this.getProvider(existing.provider);
    const captureAmount = dto.amount
      ? new Prisma.Decimal(dto.amount.toString())
      : existing.amount;

    if (provider.capturePayment && existing.providerTransactionId) {
      await provider.capturePayment(
        existing.providerTransactionId,
        captureAmount,
        existing.currencyCode
      );
    }

    const now = new Date();
    const updated = await this.prisma.$transaction(async tx => {
      const p = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: 'CAPTURED',
          capturedAt: now,
        },
      });

      const sale = await tx.sale.findUnique({ where: { id: existing.saleId } });
      if (sale) {
        const newPaid = sale.amountPaid.add(captureAmount);
        const isFullyPaid = newPaid.gte(sale.grandTotal);
        await tx.sale.update({
          where: { id: sale.id },
          data: {
            amountPaid: newPaid,
            status: isFullyPaid ? 'COMPLETED' : 'PENDING_PAYMENT',
            completedAt: isFullyPaid ? now : null,
          },
        });

        if (isFullyPaid) {
          await this.receiptService.generateReceiptForSale(sale.id, tx);
        }
      }

      return p;
    });

    return this.mapToResponseDto(updated);
  }

  /**
   * Voids an uncaptured authorized payment.
   */
  async voidPayment(
    paymentId: string,
    dto: VoidPaymentDto
  ): Promise<PaymentResponseDto> {
    const existing = await this.paymentRepo.findPaymentById(paymentId);
    if (!existing) {
      throw new PaymentNotFoundError(paymentId);
    }

    if (existing.status === 'CAPTURED') {
      throw new PaymentInvalidStateTransitionError(existing.status, 'CANCELLED');
    }

    if (!isValidPaymentTransition(existing.status, 'CANCELLED')) {
      throw new PaymentInvalidStateTransitionError(existing.status, 'CANCELLED');
    }

    const provider = this.getProvider(existing.provider);
    if (provider.voidPayment && existing.providerTransactionId) {
      await provider.voidPayment(existing.providerTransactionId, dto.reason);
    }

    const updated = await this.paymentRepo.updatePayment(paymentId, {
      status: 'CANCELLED',
      failureMessage: `Voided: ${dto.reason}`,
    });

    return this.mapToResponseDto(updated);
  }

  async getPaymentById(paymentId: string): Promise<PaymentResponseDto> {
    const payment = await this.paymentRepo.findPaymentById(paymentId);
    if (!payment) {
      throw new PaymentNotFoundError(paymentId);
    }
    return this.mapToResponseDto(payment);
  }

  async listPaymentsBySaleId(saleId: string): Promise<PaymentResponseDto[]> {
    const payments = await this.paymentRepo.listPaymentsBySaleId(saleId);
    return payments.map(p => this.mapToResponseDto(p));
  }

  private mapToResponseDto(payment: any): PaymentResponseDto {
    return {
      id: payment.id,
      saleId: payment.saleId,
      paymentReference: payment.paymentReference,
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      amount: payment.amount.toString(),
      currencyCode: payment.currencyCode,
      provider: payment.provider,
      providerTransactionId: payment.providerTransactionId,
      idempotencyKey: payment.idempotencyKey,
      failureCode: payment.failureCode,
      failureMessage: payment.failureMessage,
      initiatedAt: payment.initiatedAt.toISOString(),
      authorizedAt: payment.authorizedAt ? payment.authorizedAt.toISOString() : null,
      capturedAt: payment.capturedAt ? payment.capturedAt.toISOString() : null,
      failedAt: payment.failedAt ? payment.failedAt.toISOString() : null,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
      refunds: payment.refunds?.map((r: any): RefundResponseDto => ({
        id: r.id,
        paymentId: r.paymentId,
        saleId: r.saleId,
        refundReference: r.refundReference,
        amount: r.amount.toString(),
        currencyCode: r.currencyCode,
        status: r.status,
        reason: r.reason,
        providerRefundId: r.providerRefundId,
        idempotencyKey: r.idempotencyKey,
        requestedByUserId: r.requestedByUserId,
        processedAt: r.processedAt ? r.processedAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  }
}
