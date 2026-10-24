import { Prisma } from '@prisma/client';
import type {
  IPaymentProvider,
  PaymentProcessParams,
  PaymentResult,
  RefundResult,
} from '../payment-provider.interface.js';

/**
 * Cash Payment Provider
 *
 * Implements physical in-store cash transactions processed by an authorized cashier.
 * Cash transactions are settled immediately upon receipt of tender.
 */
export class CashPaymentProvider implements IPaymentProvider {
  readonly providerName = 'CASH';

  async processPayment(
    amount: Prisma.Decimal,
    currencyCode: string,
    params: PaymentProcessParams
  ): Promise<PaymentResult> {
    if (params.amountTendered && params.amountTendered.lt(amount)) {
      return {
        success: false,
        status: 'FAILED',
        failureCode: 'INSUFFICIENT_CASH_TENDERED',
        failureMessage: `Tendered cash (${params.amountTendered.toString()}) is less than due amount (${amount.toString()}).`,
      };
    }

    return {
      success: true,
      status: 'CAPTURED',
      providerTransactionId: `cash_${params.paymentReference}`,
      sanitizedMetadata: {
        currency: currencyCode,
        tendered: params.amountTendered?.toString() ?? amount.toString(),
      },
    };
  }

  async processRefund(
    providerTransactionId: string,
    amount: Prisma.Decimal,
    currencyCode: string,
    reason: string
  ): Promise<RefundResult> {
    return {
      success: true,
      status: 'SUCCEEDED',
      providerRefundId: `cash_refund_${Date.now()}`,
      sanitizedMetadata: {
        originalTransactionId: providerTransactionId,
        refundAmount: amount.toString(),
        currency: currencyCode,
        reason,
      },
    };
  }
}
