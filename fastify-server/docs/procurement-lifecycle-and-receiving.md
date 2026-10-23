# Procurement Lifecycle, Purchase Orders, and Goods Receiving Guide

## 1. Architectural Overview

The Suppliers & Procurement module (Stage 6) provides full-cycle procurement capabilities within the `store-management-system` modular monolith:
1. **Supplier Vendor Directory & Catalog Management (`src/modules/suppliers/`):** Manages external vendors, codes, contact points, and item-level supplier offerings with agreed purchase prices, currencies, minimum order quantities (MOQ), and lead times.
2. **Purchase Order Lifecycle (`src/modules/procurement/purchase-order.service.ts`):** Complete state machine governing formal requisition, multi-line pricing calculations, separation of duties on approval, and vendor transmission.
3. **Physical Goods Receiving & Inventory Integration (`src/modules/procurement/goods-receipt.service.ts`):** Validated physical receiving against open purchase orders, supporting partial shipments, discrepancy resolution (accepted vs rejected goods), and atomic row-locked inventory updates into the store's stock balance and movement audit ledger.

---

## 2. Purchase Order State Machine

```
  +---------+
  |  DRAFT  |
  +---------+
       |
       | submitForApproval()
       v
+------------------+             +-------------+
| PENDING_APPROVAL | ----------> |  CANCELLED  |
+------------------+             +-------------+
       | (reject back to DRAFT)         ^
       | approve()                      | cancel() [only if receivedQty == 0]
       v                                |
  +----------+                          |
  | APPROVED | -------------------------+
  +----------+                          |
       |                                |
       | markOrdered()                  |
       v                                |
  +----------+                          |
  | ORDERED  | -------------------------+
  +----------+
       |
       | receiveGoods() [partial]
       v
+--------------------+
| PARTIALLY_RECEIVED |
+--------------------+
       |
       | receiveGoods() [final]
       v
  +----------+
  | RECEIVED | (Terminal)
  +----------+
```

### Transition Invariants
- **Draft Modifications:** Line items, unit prices, discounts, and shipping costs can *only* be edited in the `DRAFT` status (`EDITABLE_PO_STATES = ['DRAFT']`).
- **Separation of Duties:** The user who authored the purchase order cannot approve it unless granted an explicit super-administrative override (`SUPER_ADMIN`).
- **Cancellation Restraints:** Orders can only be cancelled from `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, or `ORDERED` (provided zero physical goods have been received). Once any quantity is accepted into store inventory, cancellation is forbidden to safeguard financial and inventory integrity.
- **Completion Criteria:** An order only transitions to `RECEIVED` when all ordered quantities across all line items are completely satisfied (`quantityReceived >= quantityOrdered`).

---

## 3. Financial Precision & Exact Decimal Arithmetic

- **Source of Truth:** Quantities are represented as `DECIMAL(12, 4)` and monetary values as `DECIMAL(12, 2)` across database DDL and application runtime using `Prisma.Decimal`.
- **Zero Floating-Point Drift:** JavaScript native `Number` arithmetic is strictly forbidden for financial balances.
- **Line Calculation Formula:**
  $$\text{Line Subtotal} = \text{quantityOrdered} \times \text{unitPrice}$$
  $$\text{Taxable Amount} = \text{Line Subtotal} - \text{discountAmount}$$
  $$\text{Line Tax} = \text{Taxable Amount} \times \text{taxRate}$$
  $$\text{Line Total} = \text{Taxable Amount} + \text{Line Tax}$$
- **Order Level Totals:**
  $$\text{Subtotal} = \sum \text{Line Subtotal}$$
  $$\text{Discount Total} = \sum \text{discountAmount}$$
  $$\text{Tax Total} = \sum \text{Line Tax}$$
  $$\text{Grand Total} = \text{Subtotal} - \text{Discount Total} + \text{Tax Total} + \text{Shipping Total}$$

---

## 4. Physical Goods Receiving & Inventory Integration

When goods arrive at the destination store:
1. **Validation:**
   - The delivery line must match a valid `PurchaseOrderItem` belonging to that purchase order.
   - Quantity integrity: $\text{quantityDelivered} = \text{quantityAccepted} + \text{quantityRejected}$.
   - Outstanding ceiling: $\text{quantityAccepted} \le \text{quantityOrdered} - \text{quantityReceived}$.
   - Reason enforcement: When $\text{quantityRejected} > 0$, a non-empty `rejectionReason` is strictly required.
2. **Concurrency-Safe Row Locking:**
   - To eliminate race conditions and deadlocks, variant IDs in the delivery batch are sorted alphabetically before lock acquisition.
   - For each accepted variant, the interactive transaction acquires an exclusive row-level lock on `inventory_balances` (`SELECT ... FOR UPDATE`).
3. **Atomic Balance & Movement Ledger Creation:**
   - The store's `quantityOnHand` is atomically incremented by `quantityAccepted`.
   - An immutable audit entry is written to `inventory_movements`:
     - `movementType: 'STOCK_RECEIVED'`
     - `referenceType: 'PURCHASE_ORDER'`
     - `referenceId: purchaseOrderNumber`
     - Signed delta: $+ \text{quantityAccepted}$
4. **Idempotency Protection:**
   - Clients may send an `idempotencyKey`. Retrying with identical parameters returns the cached delivery record without double-incrementing stock. If retried with conflicting payloads, HTTP 409 Conflict is returned.
