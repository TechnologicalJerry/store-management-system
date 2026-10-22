# Inventory Concurrency, Idempotency & Transfer Lifecycle

This document describes the architectural design and concurrency controls implemented in **Stage 5: Inventory Management**.

---

## 1. Concurrency Control Strategy

To prevent race conditions, lost updates, and overselling under high concurrency:

1. **Row-Level Exclusive Locking (`SELECT ... FOR UPDATE`):**
   - Stock modifications (`receiveStock`, `adjustStock`, `createReservation`, `releaseReservation`, `fulfillReservation`, `shipTransfer`, `receiveTransfer`) execute inside interactive Prisma transactions (`prisma.$transaction`).
   - Before applying quantity updates, an explicit row-level lock is acquired on `inventory_balances` using parameterized raw SQL:
     ```sql
     SELECT id, store_id, variant_id, quantity_on_hand, quantity_reserved, reorder_level
     FROM inventory_balances
     WHERE store_id = $1::uuid AND variant_id = $2::uuid
     FOR UPDATE;
     ```
   - This ensures that competing transactions for the same store/variant execute sequentially.

2. **Deterministic Lock Acquisition (Deadlock Prevention):**
   - In multi-item transfer operations (`shipTransfer` and `receiveTransfer`), items are sorted alphabetically by `variantId` prior to acquiring locks.
   - By locking resources in a consistent global order, cyclic lock dependencies and database deadlocks are eliminated.

3. **Atomic Balance Initialization:**
   - Initial balances are created using PostgreSQL `UPSERT` (`INSERT ... ON CONFLICT (store_id, variant_id) DO NOTHING`), preventing race conditions when two concurrent requests first reference a variant.

---

## 2. Idempotency Strategy

Network retries and duplicate HTTP requests are handled safely:
- Both `POST /receipts` and `POST /adjustments` support an optional client-supplied `idempotencyKey`.
- When an `idempotencyKey` is supplied, the system inspects the `inventory_movements` ledger for an existing entry matching the `storeId` and `idempotencyKey`:
  - **Identical Replay:** If the recorded movement matches the target `variantId` and quantity delta, the server returns the existing balance and movement without reapplying the balance change.
  - **Mismatched Replay:** If the existing key was used for a different variant or quantity, the server throws an HTTP 409 Conflict (`DuplicateIdempotencyKeyError`).

---

## 3. Stock Availability & Invariants

All stock quantities are stored as exact decimals (`DECIMAL(12, 4)`) to eliminate floating-point arithmetic errors.

- **Derived Available Stock:**
  $$\text{quantityAvailable} = \text{quantityOnHand} - \text{quantityReserved}$$
- **Database Check Constraints:**
  - `quantity_on_hand >= 0`
  - `quantity_reserved >= 0`
  - `quantity_reserved <= quantity_on_hand`
  - `reorder_level >= 0`

---

## 4. Transfer State Machine

Inter-store transfers follow a strict server-side state transition lifecycle:

```
[DRAFT] -> (submit) -> [REQUESTED] -> (approve) -> [APPROVED] -> (ship) -> [SHIPPED] -> (receive) -> [RECEIVED] / [PARTIALLY_RECEIVED]
   |                      |                          |
   +-------> (cancel) <---+--------------------------+
```

- Stock is **only** deducted from the source store upon executing `shipTransfer`.
- Stock is **only** credited to the destination store upon executing `receiveTransfer`.
- Cancellation is restricted to pre-shipment states (`DRAFT`, `REQUESTED`, `APPROVED`).
- Partial receipts record discrepancies without silently discarding shortages.
