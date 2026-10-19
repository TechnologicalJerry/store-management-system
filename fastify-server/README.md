# Store Management System — Fastify Backend

Scalable, high-performance, production-ready backend service for the **Store Management System**, built with Fastify, TypeScript, PostgreSQL, Prisma ORM, and modern Node.js architecture.

---

## 1. Project Overview

The Store Management System backend is engineered to support enterprise-grade retail and multi-store operations, encompassing inventory management, supplier procurement, point-of-sale transactions, payment integrations, role-based access control, and analytical reporting.

- **Stage 1 (Foundation):** Established Fastify application factory, Zod environment validation, structured Pino logging, HTTP security hardening, rate limiting, centralized error handling, health probes, and OpenAPI documentation.
- **Stage 2 (Database & Persistence Layer):** Established PostgreSQL 17 relational persistence using Prisma ORM with `@prisma/adapter-pg` connection pooling, isolated repository boundaries, idempotent migration and seed infrastructure, and bounded database health readiness probes.

---

## 2. Technology Stack

- **Runtime:** Node.js (Active LTS `>=20.0.0`)
- **Framework:** [Fastify](https://fastify.dev/) `v5.2.1`
- **Language:** [TypeScript](https://www.typescriptlang.org/) `v5.7.3` (Strict mode enabled)
- **Module System:** ECMAScript Modules (ESM) with NodeNext resolution
- **Primary Database:** [PostgreSQL](https://www.postgresql.org/) `17`
- **ORM & Data Layer:** [Prisma ORM](https://www.prisma.io/) `v6.4.0` with `@prisma/adapter-pg` driver adapter
- **Connection Pool:** `pg` `v8.13.3` with pool bounds and connection timeouts
- **Environment Validation:** [Zod](https://zod.dev/) `v3.24.2`
- **Structured Logging:** [Pino](https://getpino.io/) `v9.6.0` through Fastify's native logging integration
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
│       └── 20261019000000_init_foundation/
│           └── migration.sql          # Initial PostgreSQL DDL migration
├── src/
│   ├── app.ts                         # Application factory & plugin composition
│   ├── server.ts                      # Server bootstrap, signal handling & graceful shutdown
│   ├── config/
│   │   └── env.ts                     # Zod-validated environment & database configuration
│   ├── plugins/
│   │   ├── security.ts                # Helmet, CORS, and Rate-limiting plugins
│   │   └── swagger.ts                 # OpenAPI 3.0 specification & Swagger UI
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
│   │   └── health/
│   │       ├── health.routes.ts       # /health/live and /health/ready endpoints
│   │       ├── health.schema.ts       # OpenAPI validation & response schemas
│   │       ├── health.service.ts      # Liveness and extensible readiness probes
│   │       └── index.ts               # Barrel export for health module
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
│       ├── fastify.d.ts               # Fastify module augmentation (app.prisma & req.id)
│       └── index.ts                   # Global type re-exports
├── tests/
│   ├── unit/
│   │   ├── env.test.ts                # Environment & database schema validation tests
│   │   ├── health.service.test.ts     # Health service probe and registration tests
│   │   ├── app-error.test.ts          # Operational error class hierarchy tests
│   │   ├── database.test.ts           # Database connection and ping timeout tests
│   │   ├── database-errors.test.ts    # Prisma error sanitization and mapping tests
│   │   └── system-setting.repository.test.ts # Repository method and transaction tests
│   └── integration/
│       ├── app.test.ts                # App factory initialization tests
│       ├── health.test.ts             # Live and Ready HTTP probe tests
│       ├── security.test.ts           # Security headers, CORS allowlist, payload limits
│       ├── error-handling.test.ts     # 404 routing, AppError & Prisma error formatting
│       ├── database.plugin.test.ts    # Fastify database decoration & lifecycle tests
│       └── database-health.test.ts    # Database readiness probe integration tests
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

---

## 5. Local PostgreSQL Infrastructure

Local PostgreSQL is orchestrated via Docker Compose:

```bash
# Start PostgreSQL 17 container in the background
docker compose up -d postgres

# Check PostgreSQL health status
docker compose ps postgres

# View database container logs
docker compose logs -f postgres

# Stop PostgreSQL container
docker compose stop postgres
```

The database container runs official `postgres:17-alpine` on port `5432` with automatic health checks (`pg_isready`) and persistent named volume storage (`store-management-postgres-data`).

---

## 6. Database Migrations and Seeding

Prisma migrations manage the relational schema lifecycle:

```bash
# Generate Prisma Client types and engine artifacts
npm run prisma:generate

# Apply pending migrations and update schema in development
npm run prisma:migrate:dev

# Deploy pending migrations in production or CI/CD pipelines
npm run prisma:migrate:deploy

# Inspect migration status across environments
npm run prisma:migrate:status

# Open interactive Prisma Studio visual browser
npm run prisma:studio

# Execute idempotent foundational seed script
npm run db:seed
```

### Initial Schema Models (Stage 2 Foundation)
- `SystemSetting` (`system_settings` table): UUID primary key, unique setting key, JSONB value, read-only flag, and time-zone-aware timestamps (`TIMESTAMPTZ(6)`).

---

## 7. Scripts and Commands

All commands are executed from the `fastify-server` directory.

### Dependency Installation
```bash
npm ci
```

### Development
```bash
npm run dev
```

### Production Build & Execution
```bash
npm run build
npm run start
```

### Code Quality & Formatting
```bash
npm run typecheck
npm run lint
npm run lint:fix
npm run format
npm run format:check
```

### Testing
```bash
npm run test
npm run test:watch
npm run test:coverage
```

---

## 8. Health and Observability Endpoints

The service exposes standardized health probes under `API_PREFIX`:

### `GET /api/v1/health/live`
- **Purpose:** Process liveness probe. Indicates whether the Node.js event loop and HTTP server are responsive.
- **Dependencies:** None. Completely independent of database availability.
- **Response `200 OK`:**
  ```json
  {
    "status": "ok",
    "uptime": 142,
    "timestamp": "2026-10-19T22:30:00.000Z"
  }
  ```

### `GET /api/v1/health/ready`
- **Purpose:** Application traffic readiness probe. Verifies whether critical subsystems (Core System, PostgreSQL) are operational.
- **Database Probe:** Runs a bounded `SELECT 1` ping with a 3,000ms timeout threshold.
- **Response `200 OK` (Healthy):**
  ```json
  {
    "status": "ready",
    "uptime": 142,
    "timestamp": "2026-10-19T22:30:00.000Z",
    "checks": {
      "system": {
        "status": "up",
        "message": "Core application system is healthy and ready to accept traffic",
        "latencyMs": 0.08
      },
      "database": {
        "status": "up",
        "message": "PostgreSQL database connection is operational",
        "latencyMs": 1.45
      }
    }
  }
  ```
- **Response `503 Service Unavailable` (Database Down):**
  ```json
  {
    "status": "unavailable",
    "uptime": 142,
    "timestamp": "2026-10-19T22:30:00.000Z",
    "checks": {
      "system": {
        "status": "up",
        "latencyMs": 0.08
      },
      "database": {
        "status": "down",
        "message": "PostgreSQL database connection is unavailable"
      }
    }
  }
  ```

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
    "details": { "field": "key" },
    "requestId": "2b6b55cf-520e-4e31-8ca0-6420bdfb9a5c",
    "timestamp": "2026-10-19T22:30:00.000Z"
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
| Stage 3 | Authentication, Session Management & JWT Security | Remaining |
| Stage 4 | Caching Layer & Background Job Processing (Redis, BullMQ) | Remaining |
| Stage 5 | Multi-Store Architecture & Role-Based Access Control (RBAC) | Remaining |
| Stage 6 | Product Catalog, Categories & Barcode Management | Remaining |
| Stage 7 | Inventory Control, Stock Transfers & Audit Tracking | Remaining |
| Stage 8 | Supplier Management, Procurement & Purchase Orders | Remaining |
| Stage 9 | Point of Sale (POS), Sales Orders, Checkout & Payments | Remaining |
| Stage 10 | Analytics, Financial Reporting, Audit Logs & Production Hardening | Remaining |
