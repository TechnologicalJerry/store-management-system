# Store Management System — Fastify Backend

Scalable, high-performance, production-ready backend service for the **Store Management System**, built with Fastify, TypeScript, PostgreSQL, Prisma ORM, and modern Node.js architecture.

---

## 1. Project Overview

The Store Management System backend is engineered to support enterprise-grade retail and multi-store operations, encompassing inventory management, supplier procurement, point-of-sale transactions, payment integrations, role-based access control, and analytical reporting.

- **Stage 1 (Foundation):** Established Fastify application factory, Zod environment validation, structured Pino logging, HTTP security hardening, rate limiting, centralized error handling, health probes, and OpenAPI documentation.
- **Stage 2 (Database & Persistence Layer):** Established PostgreSQL 17 relational persistence using Prisma ORM with `@prisma/adapter-pg` connection pooling, isolated repository boundaries, idempotent migration and seed infrastructure, and bounded database health readiness probes.
- **Stage 3 (Authentication, Sessions & Authorization):** Established Argon2id credential hashing, short-lived JWT access tokens, refresh token rotation with SHA-256 storage and replay/theft detection, transactional FIFO session management (max 2 active sessions), dual-transport cookie/bearer security, and RBAC role-to-permission route guards.

---

## 2. Technology Stack

- **Runtime:** Node.js (Active LTS `>=20.0.0`)
- **Framework:** [Fastify](https://fastify.dev/) `v5.2.1`
- **Language:** [TypeScript](https://www.typescriptlang.org/) `v5.7.3` (Strict mode enabled)
- **Module System:** ECMAScript Modules (ESM) with NodeNext resolution
- **Primary Database:** [PostgreSQL](https://www.postgresql.org/) `17`
- **ORM & Data Layer:** [Prisma ORM](https://www.prisma.io/) `v6.4.0` with `@prisma/adapter-pg` driver adapter
- **Connection Pool:** `pg` `v8.13.3` with pool bounds and connection timeouts
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
│   ├── schema.prisma                  # Prisma database schema (SystemSetting, User, Session, Audit)
│   ├── seed.ts                        # Idempotent foundational database seed script
│   └── migrations/
│       ├── 20261019000000_init_foundation/
│       │   └── migration.sql          # Initial PostgreSQL DDL migration
│       └── 20261020000000_add_auth_models/
│           └── migration.sql          # Stage 3 Authentication DDL migration
├── src/
│   ├── app.ts                         # Application factory & plugin composition
│   ├── server.ts                      # Server bootstrap, signal handling & graceful shutdown
│   ├── config/
│   │   └── env.ts                     # Zod-validated environment, database & auth configuration
│   ├── plugins/
│   │   ├── security.ts                # Helmet, CORS, and Rate-limiting plugins
│   │   ├── swagger.ts                 # OpenAPI 3.0 specification & Swagger UI
│   │   ├── authentication.ts          # Fastify authentication plugin (fastify.authenticate)
│   │   └── authorization.ts           # RBAC mappings and requireRoles / requirePermissions guards
│   ├── common/
│   │   ├── errors/
│   │   │   ├── app-error.ts           # Reusable AppError hierarchy
│   │   │   ├── error-handler.ts       # Centralized Fastify & Prisma error handlers
│   │   │   └── index.ts               # Barrel export for error module
│   │   ├── types/
│   │   │   └── index.ts               # Shared API response and health contracts
│   │   └── utils/
│   │       ├── logger.ts              # Pino logger configuration, request ID & redaction
│   │       └── index.ts               # Barrel export for utilities
│   ├── modules/
│   │   ├── health/
│   │   │   ├── health.routes.ts       # /health/live and /health/ready endpoints
│   │   │   ├── health.schema.ts       # OpenAPI validation & response schemas
│   │   │   ├── health.service.ts      # Liveness and extensible readiness probes
│   │   │   └── index.ts               # Barrel export for health module
│   │   └── auth/
│   │       ├── auth.types.ts          # Role, permission, DTO, and token types
│   │       ├── auth.schemas.ts        # Fastify / OpenAPI route schemas
│   │       ├── password.service.ts    # Argon2id password hashing and email normalization
│   │       ├── token.service.ts       # JWT access tokens and SHA-256 refresh hashing
│   │       ├── auth.repository.ts     # User, Role, Session, and Audit persistence
│   │       ├── session.service.ts     # Session lifecycle, rotation, and replay detection
│   │       ├── auth.service.ts        # Business logic for auth workflows
│   │       ├── auth.routes.ts         # Fastify route endpoints under /api/v1/auth
│   │       └── index.ts               # Barrel export for auth module
│   ├── infrastructure/
│   │   ├── index.ts                   # Architectural boundary re-exports
│   │   └── database/
│   │       ├── prisma-client.ts       # PrismaClient factory, pg.Pool & ping health check
│   │       ├── database.plugin.ts     # Fastify plugin decorating app.prisma with shutdown hooks
│   │       ├── database.types.ts      # Database types, DTOs & repository contracts
│   │       ├── database.errors.ts     # Prisma error mapping and credential sanitization
│   │       ├── repositories/
│   │       │   └── system-setting.repository.ts # Foundational setting repository
│   │       └── index.ts               # Barrel export for database module
│   └── types/
│       ├── fastify.d.ts               # Fastify module augmentation (app.prisma, req.user, app.authenticate)
│       └── index.ts                   # Global type re-exports
├── tests/
│   ├── unit/
│   │   ├── env.test.ts                # Environment & database schema validation tests
│   │   ├── health.service.test.ts     # Health service probe and registration tests
│   │   ├── app-error.test.ts          # Operational error class hierarchy tests
│   │   ├── database.test.ts           # Database connection and ping timeout tests
│   │   ├── database-errors.test.ts    # Prisma error sanitization and mapping tests
│   │   ├── system-setting.repository.test.ts # Repository method and transaction tests
│   │   ├── password.service.test.ts   # Argon2id hashing, length bounds & email normalization
│   │   ├── token.service.test.ts      # JWT signing/verification & SHA-256 token hashing
│   │   ├── authorization.test.ts      # RBAC permission deduction & route guard pre-handlers
│   │   └── session.service.test.ts    # FIFO session limits, rotation & replay detection
│   └── integration/
│       ├── app.test.ts                # App factory initialization tests
│       ├── health.test.ts             # Live and Ready HTTP probe tests
│       ├── security.test.ts           # Security headers, CORS allowlist, payload limits
│       ├── error-handling.test.ts     # 404 routing, AppError & Prisma error formatting
│       ├── database.plugin.test.ts    # Fastify database decoration & lifecycle tests
│       ├── database-health.test.ts    # Database readiness probe integration tests
│       └── auth.routes.test.ts        # Fastify injection tests for all /api/v1/auth endpoints
├── docs/
│   ├── implementation-status.md       # Implementation tracker and verification log
│   └── transaction-strategy.md        # Transaction boundaries, isolation & concurrency guide
├── .env.example                       # Documented environment variables template
├── .gitignore                         # Version control exclusions
├── .dockerignore                      # Docker context exclusions
├── Dockerfile                         # Production-ready multi-stage container manifest
├── docker-compose.yml                 # Local orchestrator with PostgreSQL 17
├── package.json                       # Project manifests and lifecycle scripts
├── package-lock.json                  # Pinned deterministic dependency lockfile
├── tsconfig.json                      # Strict TypeScript compiler options
├── eslint.config.js                   # ESLint v9 flat configuration
├── .prettierrc.json                   # Formatting style definitions
├── vitest.config.ts                   # Test runner configuration
└── README.md                          # Project documentation
```

---

## 4. Environment Configuration

Copy the template file to create your local `.env`:

```bash
cp .env.example .env
```

### Supported Configuration Variables

| Variable | Type | Default | Description |
|---|---|---|---|
| `NODE_ENV` | `string` | `development` | Runtime environment (`development`, `test`, `production`) |
| `HOST` | `string` | `0.0.0.0` | IP interface to bind server |
| `PORT` | `number` | `3000` | HTTP listening port (1 - 65535) |
| `LOG_LEVEL` | `string` | `info` | Pino log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`, `silent`) |
| `API_PREFIX` | `string` | `/api/v1` | URL prefix prepended to all versioned API routes |
| `CORS_ORIGINS` | `string` | `http://localhost:3000,http://localhost:5173` | Comma-separated allowed origins (wildcard `*` prohibited in production) |
| `SWAGGER_ENABLED` | `boolean` | `true` (dev) / `false` (prod) | Toggle Swagger UI interactive documentation |
| `DATABASE_URL` | `string` | `postgresql://postgres:postgres@localhost:5432/store_management?schema=public` | PostgreSQL pooled connection URL |
| `DATABASE_DIRECT_URL` | `string` | `undefined` | Optional direct connection URL for migrations |
| `DB_POOL_MAX` | `number` | `10` | Maximum concurrent connections in the application client pool (1 - 100) |
| `DB_CONNECTION_TIMEOUT_MS` | `number` | `5000` | Timeout threshold for establishing database connections in ms |
| `JWT_ACCESS_SECRET` | `string` | `dev-jwt-access-secret-...` | Secret key for signing HS256 JWT access tokens (min 32 chars) |
| `JWT_ACCESS_TTL` | `string` | `15m` | Lifetime duration for access tokens (`15m`, `1h`, etc.) |
| `JWT_ISSUER` | `string` | `store-management-system` | Expected token issuer (`iss` claim) |
| `JWT_AUDIENCE` | `string` | `store-management-system-api` | Expected token audience (`aud` claim) |
| `REFRESH_TOKEN_TTL_DAYS` | `number` | `7` | Refresh token validity window in days (1 - 90) |
| `MAX_ACTIVE_SESSIONS` | `number` | `2` | Maximum concurrent active sessions per user account (1 - 10) |
| `AUTH_COOKIE_NAME` | `string` | `refresh_token` | Name of the secure HttpOnly cookie for refresh tokens |
| `COOKIE_SECRET` | `string` | `dev-cookie-secret-...` | Cryptographic secret for signing HTTP cookies (min 32 chars) |

### Production Secret Management Expectations

In production (`NODE_ENV=production`):
1. Both `JWT_ACCESS_SECRET` and `COOKIE_SECRET` must be set to unique, cryptographically random values (minimum 32 characters, generated via `openssl rand -base64 32`). Development fallback strings are strictly rejected at application startup.
2. Wildcard CORS origins (`*`) are disallowed. Explicit HTTPS domains must be supplied in `CORS_ORIGINS`.
3. Database credentials and token secrets must never be committed to source control or logged in console/diagnostic outputs.

---

## 5. Local PostgreSQL Infrastructure

Local PostgreSQL is orchestrated via Docker Compose:

```bash
# Start PostgreSQL 17 container in the background
docker compose up -d postgres

# Check container health status
docker compose ps
```

---

## 6. Authentication, Sessions & RBAC Architecture

### Account Provisioning & Registration Policy
- `POST /api/v1/auth/register`: Public self-registration provisions accounts with the safe default role `CASHIER`.
- Public clients cannot assign privileged roles (`ADMIN`, `SUPER_ADMIN`, `STORE_MANAGER`, `INVENTORY_MANAGER`). Privileged role assignment is restricted to authenticated administrative workflows.
- User accounts default to status `ACTIVE` with email normalization applied consistently before storage.
- Password hashes are computed using Argon2id with memory cost `64MB`, time cost `3 iterations`, and parallelism `4 threads`. Plaintext passwords and hashes are never returned in API payloads.

### Access Tokens & Refresh Token Rotation
- **Access Tokens:** Signed using `HS256` with a short 15-minute validity window. Contains minimal claims: `sub` (User ID), `email`, `name`, `roles`, and `sessionId`.
- **Refresh Tokens:** Issued as high-entropy 64-character hex strings generated via `crypto.randomBytes(32)`.
- **Hashed Persistence:** The server never stores plaintext refresh tokens in PostgreSQL. Only the SHA-256 hash is persisted in the `sessions` table.
- **Rotation:** Every successful call to `POST /api/v1/auth/refresh` generates a new refresh token and atomically replaces the stored hash in the database within a transaction.
- **Replay / Theft Detection:** If an already-rotated or revoked refresh token is presented, the system detects a potential token theft, immediately revokes all active sessions in that token's `tokenFamily`, and logs a security audit event (`REFRESH_REUSE_DETECTED`).

### Active Session Management & FIFO Eviction Policy
- Each user account is allowed a maximum of **2 active concurrent sessions** by default (`MAX_ACTIVE_SESSIONS=2`).
- When a user logs in and the active session count reaches the threshold, the system transactionally evicts the oldest active session (First-In, First-Out) by marking it `REVOKED`. This ensures legitimate users are not locked out while strictly bounding resource usage and exposure window.

### Dual-Transport & CSRF Defense
- **Browser Clients:** Refresh tokens are transported via signed `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth` cookies. For cookie-based refresh requests, origin validation is enforced against `CORS_ORIGINS` to protect against cross-site request forgery.
- **API / Mobile Clients:** Refresh tokens can alternatively be provided in the JSON body (`{ "refreshToken": "..." }`) and access tokens in the `Authorization: Bearer <token>` header.

### Supported Roles & Central Permissions Mapping

| Role | Operational Scope | Default Permissions |
|---|---|---|
| `SUPER_ADMIN` | Global system control | `users:manage`, `stores:manage`, `products:manage`, `inventory:manage`, `procurement:manage`, `sales:manage`, `reports:read`, `audit:read` |
| `ADMIN` | Operations administration | `users:manage`, `stores:read`, `products:manage`, `inventory:manage`, `procurement:manage`, `sales:manage`, `reports:read` |
| `STORE_MANAGER` | Store-level operations | `stores:read`, `products:read`, `inventory:manage`, `procurement:create`, `procurement:read`, `sales:manage`, `reports:read` |
| `INVENTORY_MANAGER`| Warehouse & inventory control| `products:read`, `inventory:read`, `inventory:adjust`, `procurement:create`, `procurement:read` |
| `CASHIER` | Point-of-sale checkout | `products:read`, `inventory:read`, `sales:create`, `sales:read` |

Route access is enforced via `requireRoles(['ADMIN', ...])` or `requirePermissions(['users:manage', ...])`. By default, any route lacking explicit grant is denied.

---

## 7. Authentication API Endpoints

All authentication endpoints are versioned under the configured `API_PREFIX` (default `/api/v1/auth`):

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | No | Creates new account with default `CASHIER` role. Rate-limited (10 req/min). |
| `POST` | `/api/v1/auth/login` | No | Authenticates credentials, creates session with FIFO eviction, sets refresh cookie. Rate-limited (10 req/min). |
| `POST` | `/api/v1/auth/refresh` | No (Cookie/Body) | Rotates refresh token and issues new access token. Replay attacks revoke family. |
| `POST` | `/api/v1/auth/logout` | No (Cookie/Header) | Revokes active session and clears refresh token cookie. |
| `POST` | `/api/v1/auth/logout-all` | Bearer Token | Revokes all active sessions for authenticated caller across all devices. |
| `GET` | `/api/v1/auth/me` | Bearer Token | Returns sanitized authenticated user profile and evaluated RBAC permissions. |
| `GET` | `/api/v1/auth/sessions` | Bearer Token | Lists active and recent sessions for authenticated user without exposing secrets. |
| `DELETE` | `/api/v1/auth/sessions/:sessionId` | Bearer Token | Revokes session by ID. Users can revoke own; admins can revoke any session. |

---

## 8. Health and Readiness Observability

### `GET /api/v1/health/live`
- **Purpose:** Process liveness probe for Kubernetes and Docker container restarts.
- **Behavior:** Returns `200 OK` if the Fastify event loop is active. Independent of database status.

### `GET /api/v1/health/ready`
- **Purpose:** Application traffic readiness probe. Verifies whether critical subsystems (Core System, PostgreSQL) are operational.
- **Database Probe:** Runs a bounded `SELECT 1` ping with a 3,000ms timeout threshold. Returns `200 OK` when ready, or `503 Service Unavailable` if database connectivity is unavailable.

---

## 9. Error Handling Architecture

- **Prisma Error Interception:**
  - `P2002` (Unique constraint breach) -> `409 Conflict` (`UNIQUE_CONSTRAINT_VIOLATION`)
  - `P2025` (Record not found) -> `404 Not Found` (`NOT_FOUND`)
  - `P2003` (Foreign key breach) -> `400 Bad Request` (`FOREIGN_KEY_VIOLATION`)
  - `P2024`, `P1001` (Pool timeout / unreachable) -> `503 Service Unavailable` (`SERVICE_UNAVAILABLE`)
- **Sanitization:** Table names, connection strings, SQL statements, and hostnames are never exposed in HTTP error responses.
- **Structured Response Format:**
  ```json
  {
    "statusCode": 409,
    "error": "Conflict",
    "code": "UNIQUE_CONSTRAINT_VIOLATION",
    "message": "A resource with the specified unique key already exists.",
    "details": { "field": "email" },
    "requestId": "2b6b55cf-520e-4e31-8ca0-6420bdfb9a5c",
    "timestamp": "2026-10-20T22:30:00.000Z"
  }
  ```

---

## 10. Transaction and Concurrency Strategy

See [docs/transaction-strategy.md](file:///d:/GitHub/store-management-system/fastify-server/docs/transaction-strategy.md) for complete guidelines covering:
- Interactive vs batch transactions.
- Domain service transaction orchestration with repository dependency injection.
- PostgreSQL isolation levels (`ReadCommitted`, `RepeatableRead`, `Serializable`).
- Atomic field operations (`increment`, `decrement`).
- Deadlock prevention and safe retry policies.

---

## 11. Backend Development Roadmap

| Stage | Focus Area | Status |
|---|---|---|
| **Stage 1** | **Project Foundation (Fastify, TypeScript, Logging, Security, Health, Docs)** | **Implemented (Pending Verification)** |
| **Stage 2** | **Database & Persistence Layer (PostgreSQL 17, Prisma ORM, Pooling, Health)** | **Implemented (Pending Verification)** |
| **Stage 3** | **Authentication, Sessions & Authorization (Argon2id, JWT, Rotation, RBAC)** | **Implemented (Pending Verification)** |
| Stage 4 | Caching Layer & Background Job Processing (Redis, BullMQ) | Remaining |
| Stage 5 | Multi-Store Architecture & Role-Based Access Control (RBAC) | Remaining |
| Stage 6 | Product Catalog, Categories & Barcode Management | Remaining |
| Stage 7 | Inventory Control, Stock Transfers & Audit Tracking | Remaining |
| Stage 8 | Supplier Management, Procurement & Purchase Orders | Remaining |
| Stage 9 | Point of Sale (POS), Sales Orders, Checkout & Payments | Remaining |
| Stage 10 | Analytics, Financial Reporting, Audit Logs & Production Hardening | Remaining |
