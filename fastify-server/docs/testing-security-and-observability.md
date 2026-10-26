# Testing, Security, and Observability Guide — Stage 9

## Overview

This document specifies the testing architecture, security hardening measures, error handling, logging redaction, and operational observability implemented in **Stage 9** of the `store-management-system` backend.

All components adhere strictly to the modular monolith architecture, reusing existing Fastify plugins, Prisma ORM adapters, Zod validation schemas, and Pino logging infrastructure.

> **Mandatory Restriction:** In accordance with the Stage 9 specification, no commands (package installation, build, lint, migration, seed, Docker, or Vitest execution) have been executed. All testing and operational verification are deferred until after Stage 10 is complete.

---

## 1. Testing Infrastructure & Harness

### 1.1 Architecture & Principles
The testing framework is built around **Vitest** utilizing Fastify's native in-memory `.inject()` capability:
- **No Network Port Binding:** Fastify test instances are initialized in-memory without listening on a public TCP port, preventing port collisions and firewall prompts in CI environments.
- **Strict Database & External Isolation:** Unit and integration tests mock or isolate PostgreSQL (`PrismaClient`), Redis, and queues (`StandardQueue`, BullMQ). No tests touch production credentials or external networks.
- **Deterministic Time & Identifiers:** Fixed UUID fixtures (`TEST_IDS`) and deterministic timestamps ensure assertions are reproducible and immune to system clock drifts.
- **Safe Financial Precision:** Tests verify exact monetary calculations using `Prisma.Decimal` to ensure floating-point drift is strictly prevented.

### 1.2 Reusable Test Helpers
- **`tests/helpers/test-fixtures.ts`**:
  - `TEST_IDS`: Deterministic UUIDs for global super admins, store managers, cashiers, stores, categories, products, variants, and payments.
  - `createMockUserFixture()`: Generates pre-hashed Argon2id user records with role associations.
  - `createMockStoreFixture()`: Generates store entity fixtures.
  - `createMockMembershipFixture()`: Generates user-to-store membership relations with role assignments.
  - `createMockVariantFixture()`: Generates variant fixtures with exact `Prisma.Decimal` prices and cost prices.
  - `createMockBalanceFixture()`: Generates store inventory balances with exact decimal quantities.

- **`tests/helpers/test-app.ts`**:
  - `buildMockPrisma()`: Factory providing fully typed, deeply nested Vitest spies (`vi.fn()`) for all Prisma delegates (`user`, `session`, `store`, `storeMembership`, `product`, `productVariant`, `inventoryBalance`, `inventoryMovement`, `sale`, `payment`, `refund`, `systemSetting`, `$transaction`).
  - `createTestApp(customPrisma)`: Fastify test instance builder that decorates the application with `mockPrisma`, disables noisy Pino terminal output, and prepares routes for `.inject()` calls.
  - `generateTestAuthHeader(payload)`: Synchronous helper that signs valid HS256 JWT tokens with the test secret to simulate authenticated requests across distinct roles (`SUPER_ADMIN`, `STORE_MANAGER`, `CASHIER`).

---

## 2. Test Organization & Coverage Matrix

| Test Suite | File Path | Category | Scenarios Covered |
|---|---|---|---|
| **Security Regression** | `tests/unit/security-regression.test.ts` | Unit / Security | - Cross-store IDOR prevention: Cashier from Store A rejected when accessing Store B resources (`403 Forbidden`).<br>- Privilege escalation prevention: Cashier rejected when attempting admin-only user creation (`403 Forbidden`).<br>- Tampered / malformed JWT rejection (`401 Unauthorized`).<br>- Missing authentication header rejection (`401 Unauthorized`). |
| **Transaction Integrity** | `tests/unit/transaction-integrity.test.ts` | Unit / Concurrency | - Deadlock-safe cart sorting: Variant IDs sorted lexicographically before acquiring row-level locks.<br>- Stock exhaustion rollback: Atomically rolls back transaction when available quantity is insufficient.<br>- Refund limit enforcement: Rejects refunds exceeding the eligible captured payment amount.<br>- Exact decimal arithmetic: Verifies sales subtotal and tax computations use `Prisma.Decimal` without floating-point errors. |
| **Operational Metrics** | `tests/unit/metrics.service.test.ts` | Unit / Observability | - HTTP request counter and status group (2xx, 4xx, 5xx) tracking.<br>- Running average latency calculation with rolling window limits.<br>- Cache hit ratio tracking: increments hits/misses and derives exact ratio.<br>- Prometheus text exposition: formats gauges, counters, and histograms for scraping. |
| **Health & Diagnostics** | `tests/integration/health-diagnostics.routes.test.ts` | Integration / Observability | - Fast liveness probe: `GET /health/live` returns `200 OK` (`status: "alive"`).<br>- Fail-open readiness probe: `GET /health/ready` returns `200 OK` with `status: "degraded"` when Redis is down but PostgreSQL is up.<br>- Bounded readiness failure: returns `503 Service Unavailable` when critical PostgreSQL fails.<br>- Admin diagnostics route: `GET /health/diagnostics` restricted to `SUPER_ADMIN`/`ADMIN`.<br>- Metrics route: `GET /health/metrics` returns JSON or Prometheus plain text. |
| **Security Headers & CORS** | `tests/integration/security.routes.test.ts` | Integration / Security | - Helmet security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`.<br>- CORS allowlist enforcement: allowed origins permitted; disallowed origins rejected.<br>- Error sanitization: Internal server errors (`500`) scrub stack traces and raw SQL from client responses. |
| **Redis Client & Cache** | `tests/unit/redis-client.test.ts`, `tests/unit/cache.service.test.ts` | Unit / Caching | - Connection lifecycle, timeouts, ping health checks.<br>- Cache-aside pattern, stampede coalescing (`inflightRequests`), post-commit invalidation. |
| **Queue & Workers** | `tests/unit/queue.service.test.ts`, `tests/unit/worker.test.ts` | Unit / Background Jobs | - Named queues (`reports`, `reconciliation`, `cleanup`), retry backoff, exponential delays.<br>- Graceful worker shutdown and signal trapping. |
| **Reporting Engine** | `tests/unit/report.service.test.ts`, `tests/unit/report.repository.test.ts`, `tests/integration/reports.routes.test.ts` | Unit & Integration | - Sales summaries, payment reconciliation, inventory valuation, low-stock alerts, procurement.<br>- Strict ISO date parsing, 90-day range bounds, RBAC permissions (`reports:read`). |

---

## 3. Security Hardening

### 3.1 Authentication & Credential Storage
- **Argon2id Hashing:** Password hashing uses Argon2id configured with high-memory parameters (`memoryCost: 65536`, `timeCost: 3`, `parallelism: 4`) resistant to GPU cracking.
- **Short-Lived Access Tokens:** Signed with HMAC-SHA256 (`HS256`), carrying standard claims (`sub`, `email`, `role`, `storeId`, `iss`, `aud`), with a strict 15-minute expiration (`ACCESS_TOKEN_TTL=15m`).
- **Refresh Token Rotation & SHA-256 Storage:** Refresh tokens are never stored in plaintext. They are hashed using SHA-256 before persistence. Each token refresh generates a new cryptographically random token, revokes the predecessor, and invalidates the entire session family upon replay detection.
- **FIFO Session Eviction:** Users are strictly capped at a maximum of two concurrent active sessions (`MAX_ACTIVE_SESSIONS=2`). New logins automatically revoke the oldest active session in the database.

### 3.2 Authorization & Access Control
- **Deny-by-Default:** Unmatched routes or unauthenticated requests are rejected immediately with `401 Unauthorized`.
- **Centralized Permission Evaluation:** The RBAC engine maps system roles (`SUPER_ADMIN`, `ADMIN`, `STORE_MANAGER`, `CASHIER`) to discrete permissions (e.g., `inventory:read`, `sales:checkout`, `reports:read`). Endpoints enforce permissions via `requirePermissions(...)`.
- **Store-Scoped Membership Isolation:** The `requireStoreAccess` guard verifies that the authenticated user either holds a `SUPER_ADMIN` / `ADMIN` role or possesses an active `StoreMembership` matching the requested `storeId`. Cross-store IDOR attempts are rejected with `403 Forbidden`.

### 3.3 Sensitive Field Redaction & Pino Logging
Pino logger redaction paths in `src/common/utils/logger.ts` have been expanded to protect sensitive data:
- **Payment Credentials:** `cardNumber`, `card`, `cvv`, `pin`, `pan`, `accountNumber`.
- **Authentication Tokens:** `accessToken`, `refreshToken`, `token`, `sessionToken`, `authorization`.
- **Secrets & Credentials:** `password`, `passwordHash`, `secret`, `apiKey`, `clientSecret`, `REDIS_PASSWORD`, `REDIS_URL`, `DATABASE_URL`.
- **Request Headers & Cookies:** `req.headers.authorization`, `req.headers.cookie`, `set-cookie`.
- **Body Redaction:** Fastify serializer masks full request bodies for authentication, payment, and refund endpoints by default.

### 3.4 HTTP Security & Headers
- **Security Headers (`@fastify/helmet`):** Configured with strict Content Security Policy (`default-src 'self'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- **CORS Allowlist (`@fastify/cors`):** Restricts cross-origin requests to configured trusted origins (`CORS_ORIGIN`). Wildcards (`*`) are disallowed in production mode.
- **Rate Limiting (`@fastify/rate-limit`):** Sensitive endpoints (`/auth/login`, `/auth/register`, `/auth/refresh`) are bounded by strict per-IP rate limits to prevent brute-force attacks.

---

## 4. Operational Observability

### 4.1 Health Check Hierarchy
Operational health is organized into four distinct tiers:

```
┌─────────────────────────────────────────────────────────────────┐
│                       Health Architecture                       │
├─────────────────┬───────────────────────────────────────────────┤
│ Tier            │ Purpose & Behavior                            │
├─────────────────┼───────────────────────────────────────────────┤
│ /health/live    │ Fast liveness probe. Returns 200 OK if Node   │
│                 │ event loop is responsive.                     │
├─────────────────┼───────────────────────────────────────────────┤
│ /health/ready   │ Traffic readiness probe. Verifies critical    │
│                 │ dependencies. Fail-open on non-critical Redis.│
├─────────────────┼───────────────────────────────────────────────┤
│ /health/        │ Protected administrative diagnostics showing  │
│ diagnostics     │ detailed PostgreSQL, Redis, and Queue status. │
├─────────────────┼───────────────────────────────────────────────┤
│ /health/metrics │ Operational Prometheus and JSON metrics for   │
│                 │ latency, error counts, and cache efficiency.  │
└─────────────────┴───────────────────────────────────────────────┘
```

### 4.2 Fail-Open Readiness Probe Design
Redis functions strictly as an ephemeral caching accelerator; PostgreSQL remains the authoritative data store.
- **Critical Dependencies:** PostgreSQL connectivity (`SELECT 1`). If PostgreSQL fails, `/health/ready` returns `503 Service Unavailable` with `status: "unhealthy"` so load balancers cease routing traffic.
- **Non-Critical Dependencies:** Redis is registered with `isCritical: false`. If Redis is down, `/health/ready` returns `200 OK` with `status: "degraded"` and `"redis": "degraded"`. Traffic continues to be served, and `CacheService` transparently falls back to the database.

### 4.3 Metrics Collection & Prometheus Exposition
The `MetricsService` (`src/infrastructure/observability/metrics.service.ts`) collects runtime metrics without external vendor lock-in:
- **HTTP Metrics:** Total requests, response status breakdown (`2xx`, `4xx`, `5xx`), and running average latency.
- **Low-Cardinality Labeling:** Route metrics utilize Fastify route definitions (`request.routeOptions.url`, e.g., `/api/v1/stores/:storeId`) rather than raw URLs to prevent memory leaks from high cardinality.
- **Cache Metrics:** Cache hits, cache misses, and calculated hit ratios.
- **Queue Metrics:** Job enqueued counts, processing completions, and failure counts.
- **Dual Output Formats:**
  - `GET /api/v1/health/metrics` returns a structured JSON payload.
  - `GET /api/v1/health/metrics` with `Accept: text/plain` returns standard Prometheus text format suitable for scraping by Prometheus or Grafana Agent.

---

## 5. Verification Runbook (Deferred Post-Stage 10)

All command execution must wait until Stage 10 is complete. Once verified, the following test and audit commands should be executed:

```bash
# 1. Run all unit and integration test suites
npm run test

# 2. Run security and regression tests specifically
npx vitest run tests/unit/security-regression.test.ts
npx vitest run tests/unit/transaction-integrity.test.ts
npx vitest run tests/integration/security.routes.test.ts

# 3. Run health and metrics verification
npx vitest run tests/integration/health-diagnostics.routes.test.ts

# 4. Perform full TypeScript typechecking
npm run typecheck

# 5. Perform code quality linting
npm run lint

# 6. Check formatting
npm run format:check
```
