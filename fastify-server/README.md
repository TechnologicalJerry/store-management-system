# Store Management System — Fastify Backend

Scalable, high-performance, production-ready backend service for the **Store Management System**, built with Fastify, TypeScript, PostgreSQL, Prisma ORM, and modern Node.js modular monolith architecture.

---

## 1. Project Overview

The Store Management System backend is engineered to support enterprise-grade retail and multi-store operations, encompassing multi-branch store operations, staff membership assignments, product catalog taxonomies, inventory control, supplier procurement, point-of-sale transactions, payment integrations, role-based access control, and analytical reporting.

- **Stage 1 (Foundation):** Established Fastify application factory, Zod environment validation, structured Pino logging, HTTP security hardening, rate limiting, centralized error handling, health probes, and OpenAPI documentation.
- **Stage 2 (Database & Persistence Layer):** Established PostgreSQL 17 relational persistence using Prisma ORM with `@prisma/adapter-pg` connection pooling, isolated repository boundaries, idempotent migration and seed infrastructure, and bounded database health readiness probes.
- **Stage 3 (Authentication, Sessions & Authorization):** Established Argon2id credential hashing, short-lived JWT access tokens, refresh token rotation with SHA-256 storage and replay/theft detection, transactional FIFO session management (max 2 active sessions), dual-transport cookie/bearer security, and RBAC role-to-permission route guards.
- **Stage 4 (Store Management, User Administration & Product Catalog):** Established retail store branches, store-scoped staff memberships, global user administration with final-administrator safeguards, hierarchical category taxonomies with cycle detection, product catalog management, sellable SKU variants, exact Decimal pricing, and multi-store access control.
- **Stage 5 (Inventory Management):** Established store-specific inventory balances with exact decimal quantities (`DECIMAL(12, 4)`), immutable append-only movement ledger, row-level concurrency locking (`SELECT ... FOR UPDATE`), idempotent stock receiving and manual adjustments, stock reservations with availability derivations, and inter-store stock transfers with multi-step lifecycle tracking.
- **Stage 6 (Suppliers and Procurement):** Established vendor management, item-level supplier offerings with MOQs and agreed pricing, purchase order lifecycle with separation of duties, and physical goods receiving with discrepancy recording and atomic inventory updates.
- **Stage 7 (Sales and Payment Workflows):** Established point-of-sale direct checkout with server-side authoritative pricing, immutable order snapshots, deadlock-safe inventory row-locking, provider-agnostic payment boundary (`IPaymentProvider`), cash tender with change calculation, digital gateway simulation, customer receipts, and controlled refund lifecycles.
- **Stage 8 (Reporting, Redis Caching & Background Jobs):** Established Redis ephemeral cache-aside acceleration with stampede coalescing, exact-decimal database aggregation reporting (sales summary, top products, payment reconciliation, inventory valuation, low-stock alerts, procurement), persistent async report generation tickets, and standalone background worker processes with exponential backoff.
- **Stage 9 (Testing, Security & Observability):** Established Vitest test harness with in-memory Fastify injection, comprehensive security regression and concurrency test suites, enhanced Pino credential/card redaction, fail-open readiness probes, protected administrative diagnostics, and in-memory Prometheus/JSON metrics collection.
- **Stage 10 (Production Readiness & Deployment):** Established multi-stage non-root Dockerfile with tini init, isolated production Compose specification, GitHub Actions CI/CD pipeline, bounded graceful shutdown, environment secrets enforcement, database migration and zero-downtime expand-contract strategy, alerting runbook, and comprehensive post-Stage 10 final verification checklist.

---

## 2. Technology Stack

- **Runtime:** Node.js (Active LTS `>=20.0.0`)
- **Framework:** [Fastify](https://fastify.dev/) `v5.2.1`
- **Language:** [TypeScript](https://www.typescriptlang.org/) `v5.7.3` (Strict mode enabled)
- **Module System:** ECMAScript Modules (ESM) with NodeNext resolution
- **Primary Database:** [PostgreSQL](https://www.postgresql.org/) `17`
- **ORM & Data Layer:** [Prisma ORM](https://www.prisma.io/) `v6.4.0` with `@prisma/adapter-pg` driver adapter
- **Connection Pool:** `pg` `v8.13.3` with pool bounds and connection timeouts
- **Monetary Precision:** Prisma `Decimal` (`@db.Decimal(12, 2)`) preventing floating-point arithmetic errors
- **Password Hashing:** [Argon2id](https://github.com/ranisalt/node-argon2) (`argon2` `v0.41.1`)
- **Token Infrastructure:** [jsonwebtoken](https://github.com/auth0/node-jsonwebtoken) `v9.0.2` with HS256 signatures
- **Cookie Security:** [`@fastify/cookie`](https://github.com/fastify/fastify-cookie) `v11.0.2` with cryptographic signing
- **Environment Validation:** [Zod](https://zod.dev/) `v3.24.2`
- **Structured Logging:** [Pino](https://getpino.io/) `v9.6.0` through Fastify's native logging integration with credential redaction
- **API Documentation:** [OpenAPI 3.0 / Swagger UI](https://swagger.io/) via `@fastify/swagger` and `@fastify/swagger-ui`
- **Security & Hardening:**
  - HTTP Security Headers: `@fastify/helmet` `v13.0.1`
  - Cross-Origin Resource Sharing: `@fastify/cors` `v10.0.2`
  - Rate Limiting & DDoS Mitigation: `@fastify/rate-limit` `v10.2.2`
- **Testing:** [Vitest](https://vitest.dev/) `v3.0.5` with Fastify injection
- **Code Quality:** ESLint `v9.20.1` (Flat Config), Prettier `v3.5.1`
- **Cache Acceleration:** [Redis](https://redis.io/) `7.4` (Alpine) with resilient native fallback
- **Background Queues:** BullMQ-compatible queue infrastructure with retry backoff and concurrency controls
- **Containerization:** Multi-stage Dockerfile and Docker Compose with PostgreSQL 17, Redis 7.4, and Worker services

---

## 3. Directory Structure

```text
fastify-server/
├── prisma/
│   ├── schema.prisma                  # Prisma database schema definition
│   ├── seed.ts                        # Idempotent foundational database seed script
│   └── migrations/
│       ├── 20261019000000_init_foundation/
│       │   └── migration.sql          # Initial PostgreSQL DDL migration
│       ├── 20261020000000_add_auth_models/
│       │   └── migration.sql          # Stage 3 Authentication DDL migration
│       ├── 20261021000000_add_store_and_catalog_models/
│       │   └── migration.sql          # Stage 4 Store & Catalog DDL migration
│       ├── 20261022000000_add_inventory_models/
│       │   └── migration.sql          # Stage 5 Inventory & Transfers DDL migration
│       ├── 20261023000000_add_procurement_models/
│       │   └── migration.sql          # Stage 6 Suppliers & Procurement DDL migration
│       ├── 20261024000000_add_sales_and_payment_models/
│       │   └── migration.sql          # Stage 7 Sales & Payment Workflows DDL migration
│       └── 20261025000000_add_reporting_and_job_models/
│           └── migration.sql          # Stage 8 Reporting & Job Models DDL migration
├── src/
│   ├── app.ts                         # Application factory & plugin composition
│   ├── server.ts                      # Server bootstrap, signal handling & graceful shutdown
│   ├── worker.ts                      # Standalone background worker process entrypoint
│   ├── infrastructure/
│   │   ├── database/                  # PostgreSQL pool and Prisma plugin
│   │   ├── redis/                     # Redis client manager and CacheService
│   │   └── queues/                    # Queue manager and job interfaces
│   ├── jobs/                          # Typed job processors (report, reconciliation, cleanup)
│   ├── workers/                       # BaseWorker, ReportWorker, ReconciliationWorker, CleanupWorker
│   ├── config/
│   │   └── env.ts                     # Zod-validated environment, database & auth configuration
│   ├── plugins/
│   │   ├── security.ts                # Helmet, CORS, and Rate-limiting plugins
│   │   ├── swagger.ts                 # OpenAPI 3.0 specification & Swagger UI
│   │   ├── authentication.ts          # Fastify authentication plugin (fastify.authenticate)
│   │   └── authorization.ts           # RBAC mappings and requireRoles / requireStoreAccess guards
│   ├── common/
│   │   ├── errors/
│   │   │   ├── app-error.ts           # Reusable AppError hierarchy
│   │   │   ├── error-handler.ts       # Centralized Fastify & Prisma error handlers
│   │   │   └── index.ts               # Barrel export for error module
│   │   ├── types/
│   │   │   ├── pagination.ts          # Standard pagination metadata & result types
│   │   │   └── index.ts               # Shared API response and health contracts
│   │   └── utils/
│   │       ├── logger.ts              # Pino logger configuration, request ID & redaction
│   │       ├── pagination.ts          # Reusable pagination parsing and response construction
│   │       └── index.ts               # Barrel export for utilities
│   ├── modules/
│   │   ├── health/                    # Observability probes (/health/live, /health/ready)
│   │   ├── auth/                      # Authentication & sessions (/api/v1/auth)
│   │   ├── stores/                    # Store management (/api/v1/stores)
│   │   ├── users/                     # User admin & memberships (/api/v1/users, /stores/:id/members)
│   │   ├── categories/                # Product categories (/api/v1/categories)
│   │   ├── products/                  # Product catalog & variants (/api/v1/products, /variants)
│   │   ├── inventory/                 # Inventory, movements & transfers (/stores/:id/inventory, /transfers)
│   │   ├── suppliers/                 # Supplier directory & vendor catalogue (/api/v1/suppliers)
│   │   ├── procurement/               # Purchase orders & goods receipts (/api/v1/purchase-orders)
│   │   ├── sales/                     # Sales, direct checkout & receipts (/api/v1/sales, /receipts)
│   │   └── reports/                   # Reporting & analytics (/api/v1/reports)
│   │   │   ├── sale.constants.ts
│   │   │   ├── sale.types.ts
│   │   │   ├── sale.errors.ts
│   │   │   ├── sale.schemas.ts
│   │   │   ├── sale.repository.ts
│   │   │   ├── sale.service.ts
│   │   │   ├── checkout.service.ts
│   │   │   ├── receipt.service.ts
│   │   │   ├── sale.routes.ts
│   │   │   ├── receipt.routes.ts
│   │   │   └── index.ts
│   │   └── payments/                  # Payment boundary, providers & refunds (/api/v1/payments)
│   │       ├── payment.constants.ts
│   │       ├── payment.types.ts
│   │       ├── payment.errors.ts
│   │       ├── payment.schemas.ts
│   │       ├── payment.repository.ts
│   │       ├── payment-provider.interface.ts
│   │       ├── providers/
│   │       │   ├── cash.provider.ts
│   │       │   └── mock-digital.provider.ts
│   │       ├── payment.service.ts
│   │       ├── refund.service.ts
│   │       ├── payment.routes.ts
│   │       └── index.ts
│   ├── infrastructure/
│   │   ├── index.ts                   # Architectural boundary re-exports
│   │   └── database/
│   │       ├── prisma-client.ts       # PrismaClient factory, pg.Pool & ping health check
│   │       ├── database.plugin.ts     # Fastify plugin decorating app.prisma with shutdown hooks
│   │       ├── database.types.ts      # Database types, DTOs & repository contracts
│   │       ├── database.errors.ts     # Prisma error mapping and credential sanitization
│   │       ├── repositories/
│   │       │   └── system-setting.repository.ts
│   │       └── index.ts               # Barrel export for database module
│   └── types/
│       ├── fastify.d.ts               # Fastify module augmentation
│       └── index.ts                   # Global type re-exports
├── tests/
│   ├── unit/
│   │   ├── env.test.ts
│   │   ├── health.service.test.ts
│   │   ├── app-error.test.ts
│   │   ├── database.test.ts
│   │   ├── database-errors.test.ts
│   │   ├── system-setting.repository.test.ts
│   │   ├── password.service.test.ts
│   │   ├── token.service.test.ts
│   │   ├── authorization.test.ts
│   │   ├── session.service.test.ts
│   │   ├── store.service.test.ts      # Store code normalization and duplicate checks
│   │   ├── user.service.test.ts       # User admin, super admin safeguard, memberships
│   │   ├── category.service.test.ts   # Category hierarchy, slug, and cycle detection
│   │   ├── product.service.test.ts    # Decimal pricing, SKU normalization, variants
│   │   ├── store-authorization.test.ts # Multi-store access control guard
│   │   ├── supplier.service.test.ts   # Supplier CRUD, soft deletes, catalog management
│   │   ├── purchase-order.service.test.ts # PO creation, decimal math, state machine
│   │   ├── goods-receipt.service.test.ts # Physical goods receiving & inventory updates
│   │   ├── sales.state-machine.test.ts # Sales, payments & refunds state machines
│   │   ├── sale.service.test.ts       # Sale creation, authoritative pricing, cancel
│   │   ├── checkout.service.test.ts   # Direct checkout, stock deduction, cash change
│   │   ├── payment.service.test.ts    # Payment capture, void, balance checks
│   │   ├── refund.service.test.ts     # Refund calculations, state updates, isolation
│   │   └── receipt.service.test.ts    # Receipt generation, freezing, retrieval
│   └── integration/
│       ├── app.test.ts
│       ├── health.test.ts
│       ├── security.test.ts
│       ├── error-handling.test.ts
│       ├── database.plugin.test.ts
│       ├── database-health.test.ts
│       ├── auth.routes.test.ts
│       ├── stores.routes.test.ts      # Store management endpoints
│       ├── users.routes.test.ts       # User admin & store membership endpoints
│       ├── categories.routes.test.ts  # Category hierarchy endpoints
│       ├── products.routes.test.ts    # Product and variant catalog endpoints
│       ├── suppliers.routes.test.ts   # Supplier and supplier product endpoints
│       ├── purchase-orders.routes.test.ts # Purchase order lifecycle endpoints
│       ├── goods-receipts.routes.test.ts  # Goods receiving endpoints
│       ├── sales.routes.test.ts       # Sales, checkout, and cancellation endpoints
│       ├── payments.routes.test.ts    # Payment recording, capture, void, and refunds
│       └── receipts.routes.test.ts    # Customer receipt retrieval endpoints
├── docs/
│   ├── implementation-status.md       # Implementation tracker and verification log
│   ├── transaction-strategy.md        # Transaction boundaries, isolation & concurrency guide
│   ├── inventory-concurrency-and-transfers.md # Inventory movements, locking & transfers
│   ├── procurement-lifecycle-and-receiving.md # Procurement lifecycle & receiving guide
│   └── sales-checkout-and-payment-processing.md # Sales, POS checkout & payment processing
├── .env.example                       # Documented environment variables template
├── package.json                       # Project manifests and lifecycle scripts
└── README.md                          # Project documentation
```

---

## 4. Environment Configuration

Copy the template file to create your local `.env`:

```bash
cp .env.example .env
```

| Variable | Type | Default | Description |
|---|---|---|---|
| `NODE_ENV` | `string` | `development` | Runtime environment (`development`, `test`, `production`) |
| `HOST` | `string` | `0.0.0.0` | IP interface to bind server |
| `PORT` | `number` | `3000` | HTTP listening port (1 - 65535) |
| `LOG_LEVEL` | `string` | `info` | Pino log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`) |
| `API_PREFIX` | `string` | `/api/v1` | URL prefix prepended to all versioned API routes |
| `CORS_ORIGINS` | `string` | `http://localhost:3000,http://localhost:5173` | Comma-separated allowed origins (wildcard `*` prohibited in production) |
| `SWAGGER_ENABLED` | `boolean` | `true` (dev) / `false` (prod) | Toggle Swagger UI interactive documentation |
| `DATABASE_URL` | `string` | `postgresql://...` | PostgreSQL pooled connection URL |
| `DB_POOL_MAX` | `number` | `10` | Maximum concurrent connections in the application client pool |
| `DB_CONNECTION_TIMEOUT_MS` | `number` | `5000` | Timeout threshold for establishing database connections in ms |
| `JWT_ACCESS_SECRET` | `string` | Development fallback | Secret key for signing HS256 JWT access tokens (min 32 chars) |
| `JWT_ACCESS_TTL` | `string` | `15m` | Lifetime duration for access tokens |
| `REFRESH_TOKEN_TTL_DAYS` | `number` | `7` | Refresh token validity window in days |
| `MAX_ACTIVE_SESSIONS` | `number` | `2` | Maximum concurrent active sessions per user account |
| `AUTH_COOKIE_NAME` | `string` | `refresh_token` | Name of the secure HttpOnly cookie for refresh tokens |
| `COOKIE_SECRET` | `string` | Development fallback | Cryptographic secret for signing HTTP cookies (min 32 chars) |

---

## 5. Store Management, User Administration & Product Catalog (Stage 4)

### 5.1 Store & Branch Management
- Retail locations are represented by the `Store` model with unique uppercase store codes (e.g. `STORE-001`), addresses, timezones, and lifecycle statuses (`ACTIVE`, `INACTIVE`, `SUSPENDED`).
- Deletion uses soft-deletion (`deletedAt`) to ensure historical store data is never lost when referenced by future sales and stock records.
- Endpoints:
  - `POST /api/v1/stores`: Create store branch (`stores:create`).
  - `GET /api/v1/stores`: List stores with pagination and status/search filtering (`stores:read`).
  - `GET /api/v1/stores/:storeId`: Retrieve store details (`stores:read`).
  - `PATCH /api/v1/stores/:storeId`: Update store metadata (`stores:update`).
  - `PATCH /api/v1/stores/:storeId/status`: Transition store status (`stores:manage_status`).

### 5.2 User Administration & Store Memberships
- User profiles can be browsed and updated by authorized administrators without ever returning password hashes, refresh tokens, or session secrets.
- **Final Administrator Safeguard:** The service prevents deactivating or suspending the last active `SUPER_ADMIN` user in the system.
- Staff are bound to specific stores via `StoreMembership` records with store-scoped roles (`STORE_MANAGER`, `INVENTORY_MANAGER`, `CASHIER`) and membership statuses (`ACTIVE`, `INACTIVE`, `SUSPENDED`).
- Endpoints:
  - `GET /api/v1/users`: Paginated user list with role and status filtering (`users:read`).
  - `GET /api/v1/users/:userId`: Single user details (`users:read`).
  - `PATCH /api/v1/users/:userId`: Update profile name or email (`users:update`).
  - `PATCH /api/v1/users/:userId/status`: Change account status (`users:manage_status`).
  - `GET /api/v1/stores/:storeId/members`: List store staff (`store_members:read`).
  - `POST /api/v1/stores/:storeId/members`: Assign staff member to store (`store_members:create`).
  - `PATCH /api/v1/stores/:storeId/members/:membershipId`: Update role or status (`store_members:update`).
  - `DELETE /api/v1/stores/:storeId/members/:membershipId`: Revoke membership (`store_members:remove`).

### 5.3 Product Category Hierarchy
- Hierarchical product taxonomy with self-referential `parentId` relations.
- Automatic URL-friendly slug generation with uniqueness enforcement.
- **Integrity Safeguards:** Server-side validation prevents self-parenting and circular ancestor chains (e.g. A -> B -> C -> A). Deleting categories with assigned products or child categories is blocked.
- Endpoints:
  - `POST /api/v1/categories`: Create category (`categories:create`).
  - `GET /api/v1/categories`: List categories with parent relations (`categories:read`).
  - `GET /api/v1/categories/:categoryId`: Get category details (`categories:read`).
  - `PATCH /api/v1/categories/:categoryId`: Update category details (`categories:update`).
  - `PATCH /api/v1/categories/:categoryId/status`: Update status (`categories:manage_status`).
  - `DELETE /api/v1/categories/:categoryId`: Delete clean category (`categories:delete`).

### 5.4 Product Catalog & Variant Pricing
- Products are linked to active categories and represent general items with brands and lifecycle statuses (`DRAFT`, `ACTIVE`, `ARCHIVED`).
- Specific sellable units are modeled as `ProductVariant` items with uppercase unique SKUs, optional unique barcodes, and JSON attributes.
- **Exact Decimal Pricing:** Monetary prices are persisted in PostgreSQL using `DECIMAL(12, 2)` via Prisma `Decimal`, ensuring precision without JavaScript floating-point errors. Formatted as lossless two-decimal strings (e.g. `"29.99"`) in API responses.
- Supports creating products with an initial default variant in an atomic transaction (`prisma.$transaction`).
- Endpoints:
  - `POST /api/v1/products`: Create product and optional initial variant (`products:create`).
  - `GET /api/v1/products`: Paginated product catalog with category/brand/search filters (`products:read`).
  - `GET /api/v1/products/:productId`: Product details with variants (`products:read`).
  - `PATCH /api/v1/products/:productId`: Update product details (`products:update`).
  - `PATCH /api/v1/products/:productId/status`: Update product status (`products:manage_status`).
  - `POST /api/v1/products/:productId/variants`: Add variant to product (`product_variants:manage`).
  - `GET /api/v1/products/:productId/variants`: List variants of a product (`products:read`).
  - `GET /api/v1/variants/:variantId`: Get variant details (`products:read`).
  - `PATCH /api/v1/variants/:variantId`: Update variant SKU, barcode, or price (`product_variants:manage`).
  - `PATCH /api/v1/variants/:variantId/status`: Update variant status (`product_variants:manage`).

### 5.5 Multi-Store Access Control
- Access control integrates global roles with store-scoped memberships using `requireStoreAccess(permission)`:
  - Global `SUPER_ADMIN` and `ADMIN` roles possess universal cross-store authority.
  - Store-level staff (`STORE_MANAGER`, `INVENTORY_MANAGER`, `CASHIER`) must hold an `ACTIVE` membership in the specified store with an assigned role that grants the requested permission.
  - Operations targeting inactive or suspended stores are rejected.

---

## 6. Inventory & Inter-Store Transfers (Stage 5)

### 6.1 Store Inventory Operations (`/api/v1/stores/:storeId/inventory`)
- `GET /api/v1/stores/:storeId/inventory`: Paginated list of inventory balances with search and category filtering (`inventory:read`).
- `GET /api/v1/stores/:storeId/inventory/low-stock`: Filtered list of variants where `quantityOnHand <= reorderLevel` (`inventory:read`).
- `GET /api/v1/stores/:storeId/inventory/:variantId`: Single variant balance with derived `quantityAvailable` (`inventory:read`).
- `GET /api/v1/stores/:storeId/inventory/:variantId/movements`: Audit movement history for a specific variant (`inventory:read_movements`).
- `GET /api/v1/stores/:storeId/inventory/movements`: Comprehensive store movement ledger with date/type filtering (`inventory:read_movements`).
- `POST /api/v1/stores/:storeId/inventory/receipts`: Idempotent stock receiving with atomic row lock (`inventory:receive`).
- `POST /api/v1/stores/:storeId/inventory/adjustments`: Manual increase/decrease with mandatory reason and invariant checks (`inventory:adjust`).
- `POST /api/v1/stores/:storeId/inventory/reservations`: Hold stock for order/checkout without reducing on-hand (`inventory:manage_reservations`).
- `PATCH /api/v1/stores/:storeId/inventory/reservations/:id/release`: Release active reservation back to available stock (`inventory:manage_reservations`).
- `PATCH /api/v1/stores/:storeId/inventory/reservations/:id/fulfill`: Fulfill reservation into completed sale, decrementing on-hand and reserved simultaneously (`inventory:manage_reservations`).

### 6.2 Inter-Store Inventory Transfers (`/api/v1/inventory-transfers`)
- `POST /api/v1/inventory-transfers`: Create inter-store transfer request in `DRAFT` status (`inventory_transfers:create`).
- `GET /api/v1/inventory-transfers`: List transfers with source, destination, and status filters (`inventory_transfers:read`).
- `GET /api/v1/inventory-transfers/:transferId`: Get transfer details including item lines and lifecycle timestamps (`inventory_transfers:read`).
- `PATCH /api/v1/inventory-transfers/:transferId/submit`: Transition `DRAFT` -> `REQUESTED` (`inventory_transfers:create`).
- `PATCH /api/v1/inventory-transfers/:transferId/approve`: Transition `REQUESTED` -> `APPROVED` (`inventory_transfers:approve`).
- `PATCH /api/v1/inventory-transfers/:transferId/ship`: Atomically lock source items, deduct stock, and record `TRANSFER_OUT` (`inventory_transfers:ship`).
- `PATCH /api/v1/inventory-transfers/:transferId/receive`: Atomically lock destination items, credit stock, and mark `RECEIVED` or `PARTIALLY_RECEIVED` (`inventory_transfers:receive`).
- `PATCH /api/v1/inventory-transfers/:transferId/cancel`: Cancel unshipped transfer (`inventory_transfers:cancel`).

---

## 7. Suppliers & Procurement (Stage 6)

### 7.1 Suppliers Management & Product Offerings (`/api/v1/suppliers`)
- `POST /api/v1/suppliers`: Register vendor with unique code and tax identifier (`suppliers:create`).
- `GET /api/v1/suppliers`: Paginated supplier directory with status and name/code search (`suppliers:read`).
- `GET /api/v1/suppliers/:supplierId`: Single supplier profile and product statistics (`suppliers:read`).
- `PATCH /api/v1/suppliers/:supplierId`: Update contact and address information (`suppliers:update`).
- `PATCH /api/v1/suppliers/:supplierId/status`: Transition operational status (`ACTIVE`, `INACTIVE`, `SUSPENDED`) (`suppliers:update`).
- `DELETE /api/v1/suppliers/:supplierId`: Soft delete supplier with safeguard preventing deletion if orders exist (`suppliers:delete`).
- `GET /api/v1/suppliers/:supplierId/products`: Paginated catalog of products supplied by vendor (`suppliers:read`).
- `POST /api/v1/suppliers/:supplierId/products`: Link product variant with agreed price, MOQ, and lead time (`suppliers:update`).
- `PATCH /api/v1/suppliers/:supplierId/products/:supplierProductId`: Update pricing or order constraints (`suppliers:update`).
- `DELETE /api/v1/suppliers/:supplierId/products/:supplierProductId`: Unlink variant from supplier catalogue (`suppliers:delete`).

### 7.2 Purchase Order Lifecycle (`/api/v1/purchase-orders`)
- `POST /api/v1/purchase-orders`: Create new requisition in `DRAFT` status with exact decimal calculations (`purchase_orders:create`).
- `GET /api/v1/purchase-orders`: List purchase orders filtered by supplier, store, status, and dates (`purchase_orders:read`).
- `GET /api/v1/purchase-orders/:purchaseOrderId`: Get order details, line snapshots, status history, and receipt count (`purchase_orders:read`).
- `PATCH /api/v1/purchase-orders/:purchaseOrderId`: Modify draft line items, pricing, or shipping (`purchase_orders:update`).
- `POST /api/v1/purchase-orders/:purchaseOrderId/submit`: Transition `DRAFT` -> `PENDING_APPROVAL` (`purchase_orders:update`).
- `POST /api/v1/purchase-orders/:purchaseOrderId/approve`: Transition to `APPROVED`. Enforces separation of duties (creator cannot approve unless SUPER_ADMIN) (`purchase_orders:approve`).
- `POST /api/v1/purchase-orders/:purchaseOrderId/order`: Transition `APPROVED` -> `ORDERED` and set vendor transmission timestamp (`purchase_orders:update`).
- `POST /api/v1/purchase-orders/:purchaseOrderId/cancel`: Cancel order if zero deliveries have been accepted (`purchase_orders:cancel`).

### 7.3 Goods Receiving & Inventory Integration (`/api/v1/purchase-orders/:id/receipts`, `/api/v1/goods-receipts`)
- `POST /api/v1/purchase-orders/:purchaseOrderId/receipts`: Record physical delivery against `ORDERED` or `PARTIALLY_RECEIVED` order. Distinguishes accepted vs rejected quantities, increments destination store `quantityOnHand` via row lock `FOR UPDATE`, and logs `STOCK_RECEIVED` movements (`goods_receipts:create`).
- `GET /api/v1/purchase-orders/:purchaseOrderId/receipts`: List delivery receipts for a specific purchase order (`goods_receipts:read`).
- `GET /api/v1/goods-receipts/:goodsReceiptId`: Retrieve detailed goods receipt with line items and rejection reasons (`goods_receipts:read`).

---

## 8. Authentication API Endpoints (Stage 3)

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | No | Creates new account with default `CASHIER` role. Rate-limited. |
| `POST` | `/api/v1/auth/login` | No | Authenticates credentials, creates session with FIFO eviction, sets refresh cookie. |
| `POST` | `/api/v1/auth/refresh` | Cookie / Body | Rotates refresh token and issues new access token. Replay attacks revoke family. |
| `POST` | `/api/v1/auth/logout` | Cookie / Header | Revokes active session and clears refresh token cookie. |
| `POST` | `/api/v1/auth/logout-all` | Bearer Token | Revokes all active sessions for authenticated caller across all devices. |
| `GET` | `/api/v1/auth/me` | Bearer Token | Returns sanitized authenticated user profile and evaluated RBAC permissions. |
| `GET` | `/api/v1/auth/sessions` | Bearer Token | Lists active and recent sessions for authenticated user without exposing secrets. |
| `DELETE` | `/api/v1/auth/sessions/:sessionId` | Bearer Token | Revokes session by ID. Users can revoke own; admins can revoke any session. |

---

## 9. Sales, Checkout and Payment API Endpoints (Stage 7)

| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `POST` | `/api/v1/sales` | `sales:create` | Creates a new draft sale with server-side authoritative pricing calculations. |
| `GET` | `/api/v1/sales` | `sales:read` | Lists sales with filtering by store, status, cashier, date ranges, and pagination. |
| `GET` | `/api/v1/sales/:saleId` | `sales:read` | Retrieves detailed sale record with items, payment summaries, and receipts. |
| `POST` | `/api/v1/sales/checkout` | `sales:checkout` | Atomic point-of-sale direct checkout: locks stock, deducts inventory, settles payment. |
| `POST` | `/api/v1/sales/:saleId/cancel` | `sales:cancel` | Cancels in-progress sale and atomically restores any deducted stock. |
| `GET` | `/api/v1/sales/:saleId/receipt` | `receipts:read` | Retrieves the immutable customer receipt for a completed sale. |
| `POST` | `/api/v1/sales/:saleId/payments` | `payments:record_cash` / `payments:initiate` | Records or initiates a payment attempt on an existing sale. |
| `GET` | `/api/v1/sales/:saleId/payments` | `payments:read` | Lists all payments associated with a sale. |
| `GET` | `/api/v1/payments/:paymentId` | `payments:read` | Retrieves payment transaction record by ID. |
| `POST` | `/api/v1/payments/:paymentId/capture` | `payments:capture` | Captures a previously authorized payment. |
| `POST` | `/api/v1/payments/:paymentId/void` | `payments:void` | Voids an uncaptured authorized payment. |
| `POST` | `/api/v1/payments/:paymentId/refunds` | `payments:refund` | Issues a refund against an eligible captured payment. |
| `GET` | `/api/v1/payments/:paymentId/refunds` | `payments:read` | Lists all refunds recorded for a payment. |
| `GET` | `/api/v1/receipts/:receiptId` | `receipts:read` | Retrieves an immutable customer receipt by receipt ID. |

---

## 10. Reporting, Analytics and Background Job API Endpoints (Stage 8)

| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/api/v1/reports/sales-summary` | `reports:read` | Compiles gross sales, discounts, refunds, net sales, order counts, and daily series. |
| `GET` | `/api/v1/reports/top-products` | `reports:read` | Lists top-selling products and variants by quantity sold and gross revenue. |
| `GET` | `/api/v1/reports/payments` | `reports:read` | Compiles payment settlement breakdown by method, capture totals, and refund counts. |
| `GET` | `/api/v1/reports/inventory` | `reports:read` | Retrieves inventory valuation (`quantityOnHand * costPrice`), on-hand, and reserved balances. |
| `GET` | `/api/v1/reports/low-stock` | `reports:read` | Lists items where available stock is at or below the reorder threshold with shortfall. |
| `GET` | `/api/v1/reports/procurement` | `reports:read` | Summarizes purchase order statuses, ordered vs received quantities, and supplier totals. |
| `POST` | `/api/v1/reports/async` | `reports:export` | Enqueues asynchronous generation of multi-month reports returning a tracking ticket. |
| `GET` | `/api/v1/reports/async/:id` | `reports:read` | Polls status and retrieves generated payload for an asynchronous report. |

---

## 11. Health, Diagnostics and Observability

- `GET /api/v1/health/live`: Fast process liveness probe.
- `GET /api/v1/health/ready`: Fail-open traffic readiness probe:
  - Critical check: PostgreSQL connectivity (`SELECT 1`). Returns `503 Service Unavailable` if down.
  - Non-critical check: Redis connectivity (`PING`). Degrades to `status: "degraded"` but returns `200 OK` to keep traffic flowing.
- `GET /api/v1/health/diagnostics`: Administrative diagnostics providing detailed dependency statuses (PostgreSQL, Redis, Queues). Restricted to `SUPER_ADMIN` and `ADMIN`.
- `GET /api/v1/health/metrics`: Operational metrics endpoint exporting HTTP request counts, average latency, response status distribution (2xx/4xx/5xx), cache hit ratios, and worker queue backlogs. Supports JSON or Prometheus plain text formatting via `Accept: text/plain`.

---

## 12. Testing and Security Architecture

- **Fastify Injection Testing:** Test suites execute in-memory via `app.inject()`, eliminating network port bindings and firewall popups.
- **Security Regressions:** Automated tests for cross-store IDOR prevention, RBAC privilege escalation resistance, token tampering rejection, and FIFO session revocation.
- **Transaction & Concurrency Integrity:** Automated tests ensuring lexicographical variant sorting for deadlock-safe locking, atomic inventory rollback on stock exhaustion, and exact decimal arithmetic.
- **Credential & Card Redaction:** Expanded Pino redaction masks credit card PANs, CVVs, PINs, bearer/refresh tokens, password hashes, and Redis/database credentials across all logs.

---

## 13. Deployment & Operational Runbooks

Comprehensive production guides are available in the [`docs/deployment/`](file:///d:/GitHub/store-management-system/fastify-server/docs/deployment/) and [`docs/verification/`](file:///d:/GitHub/store-management-system/fastify-server/docs/verification/) directories:
- **[Production Setup & Architecture](file:///d:/GitHub/store-management-system/fastify-server/docs/deployment/production-setup.md)**: Reverse proxy (Nginx), topology, Docker Compose, Kubernetes.
- **[Environment Variables & Secrets Reference](file:///d:/GitHub/store-management-system/fastify-server/docs/deployment/environment-variables.md)**: Production environment settings, secret rotation procedures.
- **[Database Migrations Strategy](file:///d:/GitHub/store-management-system/fastify-server/docs/deployment/database-migrations.md)**: Decoupled migration runner, zero-downtime expand-contract pattern.
- **[Backup & Disaster Recovery](file:///d:/GitHub/store-management-system/fastify-server/docs/deployment/backup-and-recovery.md)**: PITR, logical dumps, RPO/RTO targets, reconciliation.
- **[Operations & Alerting Runbook](file:///d:/GitHub/store-management-system/fastify-server/docs/deployment/operations-runbook.md)**: Prometheus alerts, log analysis with jq, incident triage.
- **[Security Hardening Checklist](file:///d:/GitHub/store-management-system/fastify-server/docs/deployment/security-checklist.md)**: Production security audit, network controls.
- **[Final Verification Plan](file:///d:/GitHub/store-management-system/fastify-server/docs/verification/final-verification-plan.md)**: Post-Stage 10 execution checklist across all categories (A–G).

---

## 14. Backend Development Roadmap

| Stage | Focus Area | Status |
|---|---|---|
| **Stage 1** | **Project Foundation (Fastify, TypeScript, Logging, Security, Health, Docs)** | **Implemented (Pending Verification)** |
| **Stage 2** | **Database & Persistence Layer (PostgreSQL 17, Prisma ORM, Pooling, Health)** | **Implemented (Pending Verification)** |
| **Stage 3** | **Authentication, Sessions & Authorization (Argon2id, JWT, Rotation, RBAC)** | **Implemented (Pending Verification)** |
| **Stage 4** | **Store Management, User Administration & Product Catalog** | **Implemented (Pending Verification)** |
| **Stage 5** | **Inventory Management (Balances, Ledger, Concurrency, Transfers)** | **Implemented (Pending Verification)** |
| **Stage 6** | **Suppliers and Procurement (Catalog, Orders, Receiving, Concurrency)** | **Implemented (Pending Verification)** |
| **Stage 7** | **Sales and Payment Workflows (POS Checkout, Payments, Receipts, Refunds)** | **Implemented (Pending Verification)** |
| **Stage 8** | **Reporting, Redis Caching and Background Jobs (Analytics, Queues, Workers)** | **Implemented (Pending Verification)** |
| **Stage 9** | **Testing, Security and Observability (Vitest, Hardening, Metrics, Probes)** | **Implemented (Pending Verification)** |
| **Stage 10** | **Production Readiness & Deployment (Docker, CI/CD, Migrations, Runbooks)** | **Implemented (Pending Final Verification)** |




