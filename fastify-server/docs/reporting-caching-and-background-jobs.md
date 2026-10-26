# Stage 8: Reporting, Redis Caching, and Background Jobs Architecture

## 1. Architectural Overview & Authority Principles

Stage 8 integrates reporting and analytics, Redis ephemeral caching, and background job processing into the modular monolith backend.

### Key Architectural Tenet: PostgreSQL is Authoritative

- **PostgreSQL 17+** is the sole, authoritative source of truth for all business records: inventory balances, sales transactions, payment settlements, customer data, and security permissions.
- **Redis 7.4+** serves exclusively as an ephemeral cache accelerator and queue broker.
- **Fail-Open Strategy:** If Redis becomes unavailable, slow, or disconnected, the backend logs warnings, degrades cleanly to direct database operations, and returns authoritative data without disrupting core POS or inventory workflows.
- **No Authoritative Data in Redis:** Redis must never store authoritative inventory counts, pending transactions, token validation decisions, or payment states.

---

## 2. Ephemeral Redis Caching Strategy

### Cache-Aside Pattern
All cached entities utilize the cache-aside pattern:
1. The application checks Redis for the versioned key.
2. If present (cache hit), the deserialized JSON payload is returned immediately.
3. If absent or malformed (cache miss):
   - The authoritative data is queried from PostgreSQL.
   - The result is populated in Redis with a bounded TTL.
   - The data is returned to the client.

### Key Namespacing & Versioning
All cache keys follow strict semantic namespacing and version prefixes:
- Product Details: `v1:catalog:product:<productId>` (TTL: 600s / 10m)
- Category Metadata: `v1:catalog:category:<categoryId>` (TTL: 600s / 10m)
- Store Metadata: `v1:store:meta:<storeId>` (TTL: 1800s / 30m)
- Sales Reports: `v1:reports:sales:<storeId>:<startDate>:<endDate>:<groupBy>` (TTL: 300s / 5m)
- Top Products: `v1:reports:top-products:<storeId>:<startDate>:<endDate>:<limit>` (TTL: 300s / 5m)
- Payment Reports: `v1:reports:payments:<storeId>:<startDate>:<endDate>:<method>` (TTL: 300s / 5m)
- Inventory Reports: `v1:reports:inventory:<storeId>:<categoryId>:<page>:<limit>` (TTL: 180 = 3m)
- Procurement Reports: `v1:reports:procurement:<storeId>:<startDate>:<endDate>:<supplierId>` (TTL: 300s / 5m)

### Cache Stampede Prevention (Promise Coalescing)
To avoid thundering herds when an expensive cache key expires under high concurrency, `CacheService` tracks in-flight retrieval promises in memory (`inflightRequests`). Concurrent requests for the same missing key await the single executing database query rather than dispatching duplicate database queries.

### Post-Commit Invalidation Hooks
Cache invalidation strictly occurs **after** the corresponding database transaction successfully commits:
- Product updates/status changes: invalidate `v1:catalog:product:<id>` and pattern `v1:catalog:products:*`.
- Category updates/removals: invalidate `v1:catalog:category:<id>` and pattern `v1:catalog:categories:*`.
- Store configuration changes: invalidate `v1:store:meta:<id>` and pattern `v1:store:<id>:*`.
- Invalidation failures never roll back committed transactions; errors are logged with structured context.

---

## 3. Reporting & Analytics Module

### Exact Decimal Financial Calculations
All financial calculations employ `Prisma.Decimal` with 2-decimal rounding (`ROUND_HALF_UP`) to prevent floating-point discrepancies:

$$\text{Gross Sales} = \sum_{\text{Sale.status} \in \{\text{COMPLETED}, \text{PARTIALLY\_REFUNDED}, \text{REFUNDED}\}} \text{Sale.grandTotal}$$

$$\text{Total Discounts} = \sum \text{Sale.discountTotal}$$

$$\text{Total Refunds} = \sum \text{Sale.amountRefunded}$$

$$\text{Net Sales} = \text{Gross Sales} - \text{Total Refunds}$$

$$\text{Average Order Value} = \frac{\text{Net Sales}}{\text{Total Orders}}$$

$$\text{Net Settled Payments} = \sum \text{Payment(CAPTURED)} - \sum \text{Refund(SUCCEEDED)}$$

$$\text{Total Inventory Valuation} = \sum_{\text{Balance}} (\text{quantityOnHand} \times \text{variant.costPrice})$$

$$\text{Shortfall} = \max(0, \text{reorderLevel} - (\text{quantityOnHand} - \text{quantityReserved}))$$

### Timezone Convention
All reporting endpoints operate on **UTC** boundaries by default. Input timestamps must conform to ISO 8601 (`YYYY-MM-DDTHH:mm:ss.sssZ`).

### Synchronous vs. Asynchronous Reports
- Synchronous reports are bounded to a maximum date interval of **90 days**.
- Queries exceeding 90 days (up to 366 days) must be dispatched asynchronously via `POST /api/v1/reports/async`.
- Asynchronous reports generate persistent tracking tickets (`REP-YYYYMMDD-XXXX`) stored in `report_requests` with a **7-day retention expiry**.

---

## 4. Background Job & Worker Infrastructure

### Architecture: Modular Monolith Isolation
- **API Server Process (`src/server.ts`):** Serves HTTP endpoints, validates requests, enforces RBAC, enqueues background jobs into named queues. **Does NOT run worker job processors.**
- **Worker Process (`src/worker.ts`):** Standalone Node.js process running background job processors with dedicated concurrency pools and signal traps.

### Named Queues & Job Responsibilities
1. **`reports` Queue (`src/jobs/report-generation.job.ts`):**
   - Processes asynchronous multi-month report requests.
   - Computes database aggregations in bounded slices.
   - Persists serialized results to `report_requests.result_data`.
   - Transitions status: `PENDING` $\rightarrow$ `PROCESSING` $\rightarrow$ `COMPLETED` / `FAILED`.
   - Strictly idempotent: checks existing completion status before processing.
2. **`reconciliation` Queue (`src/jobs/payment-reconciliation.job.ts`):**
   - Scans payments in `PENDING` or `REQUIRES_ACTION` exceeding payment timeout thresholds (15 minutes).
   - Marks abandoned payment sessions as `FAILED`.
   - Never marks payments `CAPTURED` without authoritative external provider verification.
3. **`cleanup` Queue (`src/jobs/cleanup-expired-records.job.ts`):**
   - Releases expired `stock_reservations` past their TTL, returning reserved stock to the available pool.
   - Prunes processed transactional `outbox_events` older than 7 days.
   - Prunes expired `report_requests` past their 7-day retention deadline.

### Retry & Exponential Backoff Policies
- Default max attempts: 3.
- Exponential backoff formula:

$$\text{Backoff Delay} = \text{Initial Delay} \times 2^{(\text{attemptsMade} - 1)}$$

- Unhandled errors during worker processing trigger delayed re-queuing up to max attempts, after which the job transitions to `failed` with logged reason.

### Graceful Worker Shutdown
On receipt of `SIGTERM` or `SIGINT`:
1. Workers stop accepting new jobs from queues (`pause()`).
2. Currently active in-flight jobs are allowed to complete up to a 10-second drain window.
3. Redis client connection is closed cleanly (`disconnect()`).
4. Prisma client and PostgreSQL pool are disconnected (`pool.end()`).
5. Process terminates with exit code 0.

---

## 5. Environment Variables & Local Setup

```bash
# Redis Connection Configuration
REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS_ENABLED=false
REDIS_CONNECT_TIMEOUT_MS=5000

# Cache TTL Configuration (seconds)
CACHE_DEFAULT_TTL_SECONDS=300
CACHE_PRODUCT_TTL_SECONDS=600
CACHE_STORE_TTL_SECONDS=1800

# Background Worker Configuration
WORKER_CONCURRENCY=5
WORKER_ENABLED=false
```

---

## 6. Dependency & Integration Requirements Deferred to Post-Stage 10

In compliance with the implementation-only constraints:
1. `ioredis` (v5.4+) and `bullmq` (v5.41+) will be verified or installed in post-Stage 10 verification.
2. The current infrastructure modules (`IRedisClient`, `StandardQueue`, `BaseWorker`) mirror the exact API contracts of `ioredis` and `bullmq` for zero-code drop-in delegation.
3. Database migrations (`20261025000000_add_reporting_and_job_models`) and Prisma client regeneration are staged for post-Stage 10 verification.
