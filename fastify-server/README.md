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
- **Containerization:** Multi-stage Dockerfile and Docker Compose with PostgreSQL 17

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
│       └── 20261022000000_add_inventory_models/
│           └── migration.sql          # Stage 5 Inventory & Transfers DDL migration
├── src/
│   ├── app.ts                         # Application factory & plugin composition
│   ├── server.ts                      # Server bootstrap, signal handling & graceful shutdown
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
│   │   │   ├── store.types.ts
│   │   │   ├── store.schemas.ts
│   │   │   ├── store.repository.ts
│   │   │   ├── store.service.ts
│   │   │   ├── store.routes.ts
│   │   │   └── index.ts
│   │   ├── users/                     # User admin & memberships (/api/v1/users, /stores/:id/members)
│   │   │   ├── user.types.ts
│   │   │   ├── user.schemas.ts
│   │   │   ├── user.repository.ts
│   │   │   ├── user.service.ts
│   │   │   ├── user.routes.ts
│   │   │   └── index.ts
│   │   ├── categories/                # Product categories (/api/v1/categories)
│   │   │   ├── category.types.ts
│   │   │   ├── category.schemas.ts
│   │   │   ├── category.repository.ts
│   │   │   ├── category.service.ts
│   │   │   ├── category.routes.ts
│   │   │   └── index.ts
│   │   ├── products/                  # Product catalog & variants (/api/v1/products, /variants)
│   │   │   ├── product.types.ts
│   │   │   ├── product.schemas.ts
│   │   │   ├── product.repository.ts
│   │   │   ├── product.service.ts
│   │   │   ├── product.routes.ts
│   │   │   └── index.ts
│   │   └── inventory/                 # Inventory, movements & transfers (/stores/:id/inventory, /transfers)
│   │       ├── inventory.types.ts
│   │       ├── inventory.errors.ts
│   │       ├── inventory.schemas.ts
│   │       ├── inventory.repository.ts
│   │       ├── inventory.service.ts
│   │       ├── inventory-reservation.service.ts
│   │       ├── inventory-transfer.service.ts
│   │       ├── inventory.routes.ts
│   │       ├── inventory-transfer.routes.ts
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
│   │   └── store-authorization.test.ts # Multi-store access control guard
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
│       └── products.routes.test.ts    # Product and variant catalog endpoints
├── docs/
│   ├── implementation-status.md       # Implementation tracker and verification log
│   └── transaction-strategy.md        # Transaction boundaries, isolation & concurrency guide
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

## 7. Authentication API Endpoints (Stage 3)

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

## 8. Health and Readiness Observability

- `GET /api/v1/health/live`: Fast process liveness probe.
- `GET /api/v1/health/ready`: Traffic readiness probe with bounded 3,000ms PostgreSQL ping (`SELECT 1`). Returns `200 OK` or `503 Service Unavailable`.

---

## 9. Backend Development Roadmap

| Stage | Focus Area | Status |
|---|---|---|
| **Stage 1** | **Project Foundation (Fastify, TypeScript, Logging, Security, Health, Docs)** | **Implemented (Pending Verification)** |
| **Stage 2** | **Database & Persistence Layer (PostgreSQL 17, Prisma ORM, Pooling, Health)** | **Implemented (Pending Verification)** |
| **Stage 3** | **Authentication, Sessions & Authorization (Argon2id, JWT, Rotation, RBAC)** | **Implemented (Pending Verification)** |
| **Stage 4** | **Store Management, User Administration & Product Catalog** | **Implemented (Pending Verification)** |
| **Stage 5** | **Inventory Management (Balances, Ledger, Concurrency, Transfers)** | **Implemented (Pending Verification)** |
| Stage 6 | Suppliers and Procurement | Remaining |
| Stage 7 | Sales and Payment Workflows | Remaining |
| Stage 8 | Reporting, Redis Caching and Background Jobs | Remaining |
| Stage 9 | Testing, Security and Observability | Remaining |
| Stage 10 | Production Readiness and Deployment | Remaining |

