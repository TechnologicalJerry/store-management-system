import { Prisma } from '@prisma/client';
import type {
  IPaymentProvider,
  PaymentProcessParams,
  PaymentResult,
  RefundResult,
} from '../payment-provider.interface.js';

/**
 * Mock Digital / Card Payment Provider
 *
 * Dedicated test and development adapter conforming to IPaymentProvider.
 * Simulates external gateway authorization, capture, void, and refund lifecycles
 * without collecting, transmitting, or storing sensitive card or credentials data.
 */
export class MockDigitalPaymentProvider implements IPaymentProvider {
  readonly providerName = 'MOCK_DIGITAL';

  async processPayment(
    amount: Prisma.Decimal,
    currencyCode: string,
    params: PaymentProcessParams
  ): Promise<PaymentResult> {
    // Deterministic simulation: if idempotencyKey contains 'fail', simulate gateway decline
    if (params.idempotencyKey?.includes('simulate_fail')) {
      return {
        success: false,
        status: 'FAILED',
        failureCode: 'CARD_DECLINED',
        failureMessage: 'Simulated issuer decline: Card transaction was rejected by issuer.',
        sanitizedMetadata: {
          declinedAt: new Date().toISOString(),
          currency: currencyCode,
        },
      };
    }

    const txId = `mock_tx_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

    return {
      success: true,
      status: 'CAPTURED',
      providerTransactionId: txId,
      sanitizedMetadata: {
        currency: currencyCode,
        amount: amount.toString(),
        gateway: 'MockDigitalGateway_v1',
        paymentMethod: params.paymentMethod,
      },
    };
  }

  async capturePayment(
    providerTransactionId: string,
    amount: Prisma.Decimal,
    currencyCode: string
  ): Promise<PaymentResult> {
    return {
      success: true,
      status: 'CAPTURED',
      providerTransactionId,
      sanitizedMetadata: {
        amount: amount.toString(),
        currency: currencyCode,
        capturedAt: new Date().toISOString(),
      },
    };
  }

  async voidPayment(
    providerTransactionId: string,
    reason?: string
  ): Promise<PaymentResult> {
    return {
      success: true,
      status: 'FAILED', // Voiding marks payment uncaptured/cancelled
      providerTransactionId,
      sanitizedMetadata: {
        voidedAt: new Date().toISOString(),
        reason: reason ?? 'Voided by merchant',
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
      providerRefundId: `mock_ref_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      sanitizedMetadata: {
        originalTransactionId: providerTransactionId,
        refundAmount: amount.toString(),
        currency: currencyCode,
        reason,
        processedAt: new Date().toISOString(),
      },
    };
  }
}
