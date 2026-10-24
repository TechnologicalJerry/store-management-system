import { Prisma, type PrismaClient } from '@prisma/client';
import { PaymentRepository } from './payment.repository.js';
import { SaleRepository } from '../sales/sale.repository.js';
import type { IPaymentProvider } from './payment-provider.interface.js';
import { CashPaymentProvider } from './providers/cash.provider.js';
import { MockDigitalPaymentProvider } from './providers/mock-digital.provider.js';
import {
  PaymentNotFoundError,
  PaymentInvalidStateTransitionError,
  RefundAmountExceedsCapturedError,
  RefundNotFoundError,
} from './payment.errors.js';
import type { CreateRefundDto, RefundResponseDto } from './payment.types.js';

export class RefundService {
  private readonly paymentRepo: PaymentRepository;
  private readonly saleRepo: SaleRepository;
  private readonly providers: Map<string, IPaymentProvider> = new Map();

  constructor(private readonly prisma: PrismaClient) {
    this.paymentRepo = new PaymentRepository(prisma);
    this.saleRepo = new SaleRepository(prisma);

    this.providers.set('CASH', new CashPaymentProvider());
    this.providers.set('MOCK_DIGITAL', new MockDigitalPaymentProvider());
  }

  private getProvider(name: string): IPaymentProvider {
    return this.providers.get(name.toUpperCase()) ?? this.providers.get('MOCK_DIGITAL')!;
  }

  /**
   * Processes a refund against an eligible captured payment:
   * 1. Validates that payment exists and is in CAPTURED or PARTIALLY_REFUNDED state.
   * 2. Checks concurrency-safe refundable balance (captured amount minus existing successful refunds).
   * 3. Dispatches refund to payment provider outside the database transaction.
   * 4. In a transaction, persists the Refund record and updates payment and sale financial balances.
   *
   * Note on Inventory: By design, financial refunds do NOT automatically return products to inventory,
   * as physical items require physical inspection and quality assessment in a separate returns workflow.
   */
  async processRefund(
    paymentId: string,
    requestedByUserId: string,
    dto: CreateRefundDto
  ): Promise<RefundResponseDto> {
    // Idempotency check
    if (dto.idempotencyKey) {
      const existing = await this.paymentRepo.findRefundByIdempotencyKey(dto.idempotencyKey);
      if (existing) {
        return this.mapToResponseDto(existing);
      }
    }

    const payment = await this.paymentRepo.findPaymentById(paymentId);
    if (!payment) {
      throw new PaymentNotFoundError(paymentId);
    }

    if (payment.status !== 'CAPTURED' && payment.status !== 'PARTIALLY_REFUNDED') {
      throw new PaymentInvalidStateTransitionError(
        payment.status,
        'Refund requires payment to be CAPTURED or PARTIALLY_REFUNDED'
      );
    }

    const refundAmount = new Prisma.Decimal(dto.amount.toString());

    // Check available refundable amount inside a repeatable read transaction
    const refundableBalance = await this.prisma.$transaction(async tx => {
      const alreadyRefunded = await this.paymentRepo.sumSuccessfulRefundsForPayment(paymentId, tx);
      return payment.amount.sub(alreadyRefunded);
    });

    if (refundAmount.gt(refundableBalance)) {
      throw new RefundAmountExceedsCapturedError(
        refundAmount.toString(),
        refundableBalance.toString()
      );
    }

    const refundReference = await this.paymentRepo.generateRefundReference();
    const provider = this.getProvider(payment.provider);

    // Call payment provider outside DB transaction
    const providerResult = await provider.processRefund(
      payment.providerTransactionId ?? payment.paymentReference,
      refundAmount,
      payment.currencyCode,
      dto.reason
    );

    const isSuccess = providerResult.success && providerResult.status === 'SUCCEEDED';
    const refundStatus = isSuccess ? 'SUCCEEDED' : 'FAILED';
    const processedAt = isSuccess ? new Date() : null;

    // Atomically persist refund and update payment & sale
    const refund = await this.prisma.$transaction(async tx => {
      const createdRefund = await tx.refund.create({
        data: {
          paymentId: payment.id,
          saleId: payment.saleId,
          refundReference,
          amount: refundAmount,
          currencyCode: payment.currencyCode,
          status: refundStatus,
          reason: dto.reason,
          providerRefundId: providerResult.providerRefundId ?? null,
          idempotencyKey: dto.idempotencyKey ?? null,
          requestedByUserId,
          processedAt,
        },
      });

      if (isSuccess) {
        // Update payment status
        const totalRefundedNow = (
          await this.paymentRepo.sumSuccessfulRefundsForPayment(payment.id, tx)
        );
        const isFullPaymentRefund = totalRefundedNow.gte(payment.amount);
        const newPaymentStatus = isFullPaymentRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

        await tx.payment.update({
          where: { id: payment.id },
          data: { status: newPaymentStatus },
        });

        // Update sale amountRefunded and status
        const sale = await tx.sale.findUnique({ where: { id: payment.saleId } });
        if (sale) {
          const newSaleRefunded = sale.amountRefunded.add(refundAmount);
          const isFullSaleRefund = newSaleRefunded.gte(sale.amountPaid);
          const newSaleStatus = isFullSaleRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED';

          await tx.sale.update({
            where: { id: sale.id },
            data: {
              amountRefunded: newSaleRefunded,
              status: newSaleStatus,
            },
          });
        }
      }

      return createdRefund;
    });

    return this.mapToResponseDto(refund);
  }

  async getRefundById(refundId: string): Promise<RefundResponseDto> {
    const refund = await this.paymentRepo.findRefundById(refundId);
    if (!refund) {
      throw new RefundNotFoundError(refundId);
    }
    return this.mapToResponseDto(refund);
  }

  async listRefundsByPaymentId(paymentId: string): Promise<RefundResponseDto[]> {
    const refunds = await this.paymentRepo.listRefundsByPaymentId(paymentId);
    return refunds.map(r => this.mapToResponseDto(r));
  }

  private mapToResponseDto(refund: any): RefundResponseDto {
    return {
      id: refund.id,
      paymentId: refund.paymentId,
      saleId: refund.saleId,
      refundReference: refund.refundReference,
      amount: refund.amount.toString(),
      currencyCode: refund.currencyCode,
      status: refund.status,
      reason: refund.reason,
      providerRefundId: refund.providerRefundId,
      idempotencyKey: refund.idempotencyKey,
      requestedByUserId: refund.requestedByUserId,
      processedAt: refund.processedAt ? refund.processedAt.toISOString() : null,
      createdAt: refund.createdAt.toISOString(),
      updatedAt: refund.updatedAt.toISOString(),
    };
  }
}
