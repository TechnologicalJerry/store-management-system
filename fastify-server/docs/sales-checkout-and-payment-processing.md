# Sales, Checkout, and Payment Processing Architecture Guide

## 1. Architectural Overview

The Sales and Payments modules (Stage 7) provide production-grade retail transaction, point-of-sale checkout, and multi-provider payment settlement capabilities within the `store-management-system` modular monolith:

1. **Sales & Checkout Engine (`src/modules/sales/`):**
   - Authoritative server-side pricing snapshots, line totals, and exact decimal financial calculation.
   - Atomic direct checkout integrating stock validation, row-level locks, balance deduction, and immutable movement ledger logging.
   - Point-of-sale customer receipts with frozen catalog and financial snapshots.
   - Comprehensive state machine controlling sales drafts, pending payments, completions, and cancellations.
2. **Provider-Agnostic Payment Boundary (`src/modules/payments/`):**
   - Clean interface abstraction (`IPaymentProvider`) isolating payment gateways from business workflows.
   - Physical cash settlement with overpayment/change computation.
   - Digital gateway simulator (`MockDigitalPaymentProvider`) for development, testing, and CI without collecting or storing real card secrets.
   - Decoupled payment lifecycle: authorization, capture, void, and refund operations.

---

## 2. Sale Lifecycle State Machine

```
  +---------+
  |  DRAFT  |
  +---------+
       |
       +-----------------------+-----------------------+
       |                       |                       |
       | checkout(asynchronous) | directCheckout(cash)  | cancelSale()
       v                       v                       v
+-----------------+     +-----------+           +-----------+
| PENDING_PAYMENT | --> | COMPLETED |           | CANCELLED | (Terminal)
+-----------------+     +-----------+           +-----------+
       |                       |
       | cancelSale()          | refund(partial)
       v                       v
+-----------+           +--------------------+
| CANCELLED |           | PARTIALLY_REFUNDED |
+-----------+           +--------------------+
                               |
                               | refund(remaining balance)
                               v
                        +-----------+
                        | REFUNDED  | (Terminal)
                        +-----------+
```

### Transition Invariants
- **Draft & Pending Modifications:** Sales can be created as `DRAFT` or `PENDING_PAYMENT` and cancelled safely.
- **Stock Restoration on Cancellation:** If a sale in `PENDING_PAYMENT` is cancelled, any deducted stock is atomically restored to inventory via an immutable `RETURN` movement.
- **Completion Invariant:** A sale transitions to `COMPLETED` only when captured payments equal or exceed the grand total (`amountPaid >= grandTotal`). Ordinary users cannot arbitrarily mark sales completed.
- **No Direct Cancellation of Completed Sales:** Once a sale is `COMPLETED`, cancellation is forbidden. Captured funds must undergo an explicit refund workflow.

---

## 3. Server-Side Authoritative Pricing & Exact Decimal Calculations

- **Catalog Isolation:** Clients cannot supply or override unit prices, tax rates, or line totals. All prices are resolved from authoritative `ProductVariant.price` records in the database.
- **Frozen Snapshots:** When an order item is created, catalog attributes (`skuSnapshot`, `productNameSnapshot`, `variantNameSnapshot`, `unitPrice`, `taxRate`) are permanently frozen in `SaleItem` to preserve historical auditability even if catalog prices change later.
- **Precision Conventions:**
  - Prices, totals, discounts, taxes: `DECIMAL(12, 2)` using `Prisma.Decimal.ROUND_HALF_UP`.
  - Item quantities: `DECIMAL(12, 4)`.
  - Line Total formula: `(unitPrice * quantity) - discountAmount + taxAmount`.
  - Grand Total formula: `subtotal - discountTotal + taxTotal`.

---

## 4. Concurrency-Safe Inventory Integration

To prevent overselling and eliminate race conditions under concurrent checkouts:
1. **Deadlock Prevention:** All requested `variantId`s are sorted alphabetically before acquiring database locks.
2. **Row-Level Locking:** Row-level locks (`SELECT ... FOR UPDATE`) are acquired on `inventory_balances` for `(storeId, variantId)` within an isolated transaction.
3. **Availability Invariant:** Available quantity is strictly validated:
   $$\text{quantityOnHand} - \text{quantityReserved} \ge \text{quantityRequired}$$
4. **Atomic Balance Deduction:** `quantityOnHand` is reduced by the sold quantity.
5. **Audit Ledger Logging:** An append-only immutable `InventoryMovement` entry is logged with `movementType: 'SALE'`, `referenceType: 'SALE'`, and `referenceId: saleNumber`.

---

## 5. Payment Provider Boundary & Security Safeguards

### Provider Architecture
```
              +--------------------------+
              |    IPaymentProvider      |
              +--------------------------+
                           ^
             +-------------+-------------+
             |                           |
+--------------------------+  +-------------------------------+
|   CashPaymentProvider    |  |  MockDigitalPaymentProvider   |
+--------------------------+  +-------------------------------+
| - Physical cash tender   |  | - Gateway simulation (Dev/CI) |
| - Immediate settlement   |  | - Auth / Capture / Void       |
| - Change calculation     |  | - No card data collected      |
+--------------------------+  +-------------------------------+
```

### Security & PCI-DSS Compliance Invariants
1. **No Sensitive Payment Data:** Raw credit card numbers, CVVs, PINs, cardholder magnetic data, or provider access tokens are **never** collected, stored, processed, or logged.
2. **Transaction Boundary Decoupling:** External payment provider network calls are **never** performed while holding a database transaction open. External operations occur outside DB transactions, and outcomes are committed in a separate atomic database transaction.
3. **No Forged Client Outcomes:** Clients cannot set payment status to `CAPTURED` or refund status to `SUCCEEDED`. All outcomes require provider verification or authorized cashier processing.

---

## 6. Payment & Refund Lifecycles

### Payment Lifecycle
- `PENDING`: Payment attempt created.
- `AUTHORIZED`: Funds held by provider, awaiting merchant capture.
- `CAPTURED`: Funds successfully settled. Increases `sale.amountPaid`. If `amountPaid >= grandTotal`, sale status becomes `COMPLETED` and receipt is issued.
- `CANCELLED` (Void): Uncaptured authorization voided by merchant.

### Refund Lifecycle
- **Eligible Status:** Refunds can only be requested against `CAPTURED` or `PARTIALLY_REFUNDED` payments.
- **Balance Invariant:** Total successful refunds for a payment can never exceed its captured amount:
  $$\sum \text{refund.amount} \le \text{payment.amount}$$
- **Concurrency Protection:** Remaining refundable balance is calculated inside a transaction before dispatching to the provider.
- **Inventory Isolation Policy:** By design, financial refunds do **not** automatically restore products to inventory. Physical items require condition checks and restocking in a separate returns workflow.

---

## 7. Customer Receipts

- **Immutability:** When a sale completes, an immutable `Receipt` entity is generated with a unique sequence-backed number (`REC-YYYYMMDD-XXXX`).
- **Complete Snapshot:** `Receipt.receiptData` stores a complete JSONB snapshot of store address, cashier name, itemized products, quantities, prices, taxes, and payment references.
- **Tamper-Proof:** Receipts cannot be issued for draft or uncompleted sales.

---

## 8. Store-Scoped Authorization & Permissions Matrix

| Permission | SUPER_ADMIN | ADMIN | STORE_MANAGER | INVENTORY_MANAGER | CASHIER |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `sales:read` | Yes | Yes | Yes | - | Yes |
| `sales:create` | Yes | Yes | Yes | - | Yes |
| `sales:checkout` | Yes | Yes | Yes | - | Yes |
| `sales:cancel` | Yes | Yes | Yes | - | Yes |
| `sales:refund` | Yes | Yes | Yes | - | - |
| `payments:read` | Yes | Yes | Yes | - | Yes |
| `payments:record_cash` | Yes | Yes | Yes | - | Yes |
| `payments:initiate` | Yes | Yes | Yes | - | Yes |
| `payments:capture` | Yes | Yes | Yes | - | - |
| `payments:void` | Yes | Yes | Yes | - | - |
| `payments:refund` | Yes | Yes | Yes | - | - |
| `receipts:read` | Yes | Yes | Yes | - | Yes |

*Separation of Duties:* Cashiers can process sales and cash payments, but cannot issue refunds (`payments:refund`) or void captured transactions (`payments:void`), which require Store Manager or Admin approval.

---

## 9. API Reference

### Sales (`/api/v1/sales`)
- `POST /api/v1/sales`: Create draft sale cart.
- `GET /api/v1/sales`: List sales with storeId, status, and date filters.
- `GET /api/v1/sales/:saleId`: Get sale details with items and payment summaries.
- `POST /api/v1/sales/checkout`: Atomic point-of-sale direct checkout.
- `POST /api/v1/sales/:saleId/cancel`: Cancel an in-progress sale.
- `GET /api/v1/sales/:saleId/receipt`: Retrieve receipt for completed sale.
- `POST /api/v1/sales/:saleId/payments`: Record payment on existing sale.
- `GET /api/v1/sales/:saleId/payments`: List payments for sale.

### Payments (`/api/v1/payments`)
- `GET /api/v1/payments/:paymentId`: Get payment details.
- `POST /api/v1/payments/:paymentId/capture`: Capture authorized payment.
- `POST /api/v1/payments/:paymentId/void`: Void uncaptured payment.
- `POST /api/v1/payments/:paymentId/refunds`: Issue refund against captured payment.
- `GET /api/v1/payments/:paymentId/refunds`: List refunds for payment.

### Receipts (`/api/v1/receipts`)
- `GET /api/v1/receipts/:receiptId`: Retrieve receipt by receipt ID.

---

## 10. Known Limitations & Deferred Work

1. **Physical Product Restocking:** Financial refunds do not automatically return items to inventory balances; a dedicated returns inspection workflow will be added.
2. **Promotions & Complex Discounts:** Only straightforward line-item discounts are currently supported. A full promotion rules engine belongs to a future stage.
3. **Background Job Reconciliation:** Asynchronous payment reconciliation via BullMQ and Redis belongs to Stage 8.
4. **Execution & Verification:** Per workflow instructions, all test execution, database migrations, and runtime verification are deferred until Stage 10.
