# Transaction & Data Integrity Strategy

This document establishes the transactional and data integrity conventions for the **Store Management System** persistence layer.

---

## 1. Core Principles

1. **Database as the Ultimate Boundary of Truth:**  
   Application-level validation (e.g. Zod, Fastify schemas) serves user experience and fast feedback. Database constraints (primary keys, foreign keys, unique constraints, check constraints, non-nullability) serve as the uncompromised final boundary of data integrity.

2. **Domain-Managed Transaction Boundaries:**  
   Repositories must **never** initiate their own transactions. Repositories accept an optional `tx?: DatabaseTransactionClient` parameter. The orchestration of transactions belongs exclusively to the **Domain Service Layer**, where multi-entity business workflows reside.

3. **Strictly Bounded Transactions:**  
   Long-running transactions hold database locks, exhaust connection pools, and elevate deadlock probability. All transactions must have explicit timeouts (default: 5,000ms max timeout, 2,000ms max acquisition wait).

4. **Zero External I/O Inside Transactions:**  
   External network requests (HTTP calls to payment gateways, email dispatches, webhook firing, Redis operations) must **never** occur inside a database transaction block. If an external service fails or delays, the database locks will remain held, degrading system throughput.

---

## 2. Prisma Transaction Models

### A. Sequential Batch Transactions (`prisma.$transaction([...])`)
Used when multiple independent queries can be executed in a single atomic database roundtrip without dependent inter-query logic.

```typescript
const [store, settings] = await prisma.$transaction([
  prisma.store.create({ data: storeData }),
  prisma.systemSetting.createMany({ data: defaultSettings }),
]);
```

### B. Interactive Transactions (`prisma.$transaction(async tx => ...)`)
Used when subsequent database operations depend on the results of preceding operations (e.g., deducting inventory balances and generating a sales receipt).

```typescript
import { Prisma } from '@prisma/client';

await prisma.$transaction(
  async (tx: Prisma.TransactionClient) => {
    // 1. Pass the transactional client into domain repositories
    const setting = await settingRepo.findByKey('system.maintenance_mode', tx);
    
    // 2. Perform transactional mutations
    await settingRepo.upsert({ key: 'system.maintenance_mode', value: true }, tx);
  },
  {
    maxWait: 2000, // Maximum time to wait for a connection from the pool (2s)
    timeout: 5000, // Maximum time the transaction is permitted to execute (5s)
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, // Default level
  }
);
```

---

## 3. PostgreSQL Isolation Levels

Prisma and PostgreSQL support three isolation levels:

| Level | Description | Recommended Usage in Store Management System |
|---|---|---|
| `ReadCommitted` | Default PostgreSQL isolation level. Prevents dirty reads. | Read-heavy queries, standard CRUD operations, configuration updates. |
| `RepeatableRead` | Prevents non-repeatable reads and phantom reads. | Inventory transfers, procurement reconciliation, batch order processing. |
| `Serializable` | Strictest isolation; emulates serial execution. Raises serialization failures (`40001`) under contention. | Critical financial ledgers, point-of-sale checkout balance decrements. |

---

## 4. Concurrency Control & Atomic Updates

### Avoid Read-Modify-Write Race Conditions
When updating numeric values (e.g. stock quantities, wallet balances, sequence counters), **never** read the current value into Node.js, compute the difference, and write it back:

```typescript
// ❌ WRONG: Prone to lost updates under concurrent access
const product = await tx.product.findUnique({ where: { id } });
await tx.product.update({ where: { id }, data: { stock: product.stock - quantity } });

// ✅ CORRECT: Atomic database-level decrement
await tx.product.update({
  where: { id },
  data: { stock: { decrement: quantity } },
});
```

---

## 5. Conflict Resolution & Deadlock Handling

1. **Deadlock Mitigation (`P2034` / SQLSTATE `40001`):**  
   To minimize deadlocks in multi-row operations, always acquire locks or update rows in a consistent, predictable order (e.g., sort entity IDs alphabetically/numerically before updating).

2. **Retry Policies for Idempotent Operations:**  
   If a transaction fails due to serialization conflicts or deadlocks (`P2034`), it may only be retried automatically if the entire operation is **strictly idempotent**.

3. **Non-Idempotent Operations:**  
   Operations that produce irreversible side-effects (e.g. charging credit cards, generating payment tokens) must fail fast, return a clean `409 Conflict` or `503 Unavailable` response, and require the client to supply an idempotency key before re-submitting.

---

## 6. Error Sanitization Standards

1. Database unique constraint violations (`P2002`) are transformed into application `ConflictError` (`409 Conflict`) without exposing table or column names.
2. Connection timeouts (`P2024`, `P1001`) are transformed into `ServiceUnavailableError` (`503 Service Unavailable`).
3. Internal SQL syntax errors, database hostnames, credentials, and schema structures are never serialized to client HTTP responses.
