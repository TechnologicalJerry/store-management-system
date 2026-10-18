# Store Management System — Fastify Backend

Scalable, high-performance, production-ready backend service for the **Store Management System**, built with Fastify, TypeScript, and modern Node.js architecture.

---

## 1. Project Overview

The Store Management System backend is engineered to support enterprise-grade retail and multi-store operations, encompassing inventory management, supplier procurement, point-of-sale transactions, payment integrations, role-based access control, and analytical reporting.

This repository implements **Stage 1: Project Foundation** of a comprehensive 10-stage development lifecycle. It establishes the application factory, robust environment validation, structured Pino logging, HTTP security hardening, rate limiting, centralized error handling, health probes, and OpenAPI documentation.

---

## 2. Technology Stack

- **Runtime:** Node.js (Active LTS `>=20.0.0`)
- **Framework:** [Fastify](https://fastify.dev/) `v5.2.1`
- **Language:** [TypeScript](https://www.typescriptlang.org/) `v5.7.3` (Strict mode enabled)
- **Module System:** ECMAScript Modules (ESM) with NodeNext resolution
- **Environment Validation:** [Zod](https://zod.dev/) `v3.24.2`
- **Structured Logging:** [Pino](https://getpino.io/) `v9.6.0` through Fastify's native logging integration
- **API Documentation:** [OpenAPI 3.0 / Swagger UI](https://swagger.io/) via `@fastify/swagger` and `@fastify/swagger-ui`
- **Security & Hardening:**
  - HTTP Security Headers: `@fastify/helmet` `v13.0.1`
  - Cross-Origin Resource Sharing: `@fastify/cors` `v10.0.2`
  - Rate Limiting & DDoS Mitigation: `@fastify/rate-limit` `v10.2.2`
- **Testing:** [Vitest](https://vitest.dev/) `v3.0.5` with Fastify injection
- **Code Quality:** ESLint `v9.20.1` (Flat Config), Prettier `v3.5.1`
- **Containerization:** Multi-stage Dockerfile and Docker Compose

---

## 3. Directory Structure

```text
fastify-server/
├── src/
│   ├── app.ts                         # Application factory & plugin composition
│   ├── server.ts                      # Server bootstrap, signal handling & graceful shutdown
│   ├── config/
│   │   └── env.ts                     # Zod-validated environment configuration
│   ├── plugins/
│   │   ├── security.ts                # Helmet, CORS, and Rate-limiting plugins
│   │   └── swagger.ts                 # OpenAPI 3.0 specification & Swagger UI
│   ├── common/
│   │   ├── errors/
│   │   │   ├── app-error.ts           # Reusable AppError hierarchy
│   │   │   ├── error-handler.ts       # Centralized Fastify error & 404 handlers
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
│   │   └── index.ts                   # Architectural boundary for external adapters
│   └── types/
│       ├── fastify.d.ts               # Fastify module type augmentations
│       └── index.ts                   # Type re-exports
├── tests/
│   ├── unit/
│   │   ├── env.test.ts                # Environment schema parsing and constraint tests
│   │   ├── health.service.test.ts     # Health service probe and registration tests
│   │   └── app-error.test.ts          # Operational error class hierarchy tests
│   └── integration/
│       ├── app.test.ts                # App factory initialization tests
│       ├── health.test.ts             # Live and Ready HTTP probe tests
│       ├── security.test.ts           # Security headers, CORS allowlist, payload limits
│       └── error-handling.test.ts     # 404 routing, AppError formatting, correlation IDs
├── docs/
│   └── implementation-status.md       # Implementation tracker and verification log
├── .env.example                       # Documented environment variables template
├── .gitignore                         # Version control exclusions
├── .dockerignore                      # Docker context exclusions
├── Dockerfile                         # Production-ready multi-stage container manifest
├── docker-compose.yml                 # Standalone local orchestrator
├── package.json                       # Project manifests and lifecycle scripts
├── package-lock.json                  # Pinned deterministic dependency lockfile
├── tsconfig.json                      # Strict TypeScript compiler options
├── eslint.config.js                   # ESLint v9 flat configuration
├── .prettierrc.json                   # Formatting style definitions
├── vitest.config.ts                   # Test runner configuration
└── README.md                          # Project documentation
```

---

## 4. Prerequisites

- **Node.js:** `>=20.0.0` (LTS recommended)
- **npm:** `>=10.0.0`
- **Docker & Docker Compose:** (Optional, for containerized execution)

---

## 5. Environment Configuration

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

---

## 6. Scripts and Commands

All commands are executed from the `fastify-server` directory.

### Dependency Installation
```bash
# Deterministic dependency installation
npm ci
```

### Development
```bash
# Launch development server with automatic file watching via tsx
npm run dev
```

### Production Build & Execution
```bash
# Compile TypeScript to JavaScript in /dist
npm run build

# Start compiled production application
npm run start
```

### Code Quality & Formatting
```bash
# Type check without emitting files
npm run typecheck

# Run ESLint analysis
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format

# Verify formatting without modifying files
npm run format:check
```

### Testing
```bash
# Run all unit and integration tests
npm run test

# Run tests in watch mode
npm run test:watch

# Generate code coverage reports
npm run test:coverage
```

---

## 7. Health and Observability Endpoints

The service exposes standardized health probes under the configured `API_PREFIX`:

### `GET /api/v1/health/live`
- **Purpose:** Process liveness probe. Indicates whether the Node.js event loop and HTTP server are responsive.
- **Dependencies:** None. Lightweight and independent of external systems.
- **Response `200 OK`:**
  ```json
  {
    "status": "ok",
    "uptime": 142,
    "timestamp": "2026-10-18T22:30:00.000Z"
  }
  ```

### `GET /api/v1/health/ready`
- **Purpose:** Application traffic readiness probe. Verifies whether critical subsystems are prepared to accept incoming requests.
- **Extensibility:** Subsystem checks (e.g. database, Redis, message bus) register via `healthService.registerReadinessCheck()`.
- **Response `200 OK` (Healthy):**
  ```json
  {
    "status": "ready",
    "uptime": 142,
    "timestamp": "2026-10-18T22:30:00.000Z",
    "checks": {
      "system": {
        "status": "up",
        "message": "Core application system is healthy and ready to accept traffic",
        "latencyMs": 0.08
      }
    }
  }
  ```
- **Response `503 Service Unavailable` (Degraded / Down):**
  ```json
  {
    "status": "unavailable",
    "uptime": 142,
    "timestamp": "2026-10-18T22:30:00.000Z",
    "checks": {
      "system": {
        "status": "up",
        "latencyMs": 0.08
      },
      "subsystem": {
        "status": "down",
        "message": "Connection failure"
      }
    }
  }
  ```

---

## 8. Swagger / OpenAPI Documentation

When `SWAGGER_ENABLED=true` (default in development), interactive OpenAPI documentation is accessible at:

```text
http://localhost:3000/docs
```

The documentation provides interactive schema validation, endpoint descriptions, and real-time request testing.

---

## 9. Error Handling Architecture

The backend implements centralized, RFC-compliant error formatting:

- **Consistent Structure:**
  ```json
  {
    "statusCode": 400,
    "error": "Bad Request",
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": [
      {
        "field": "/port",
        "message": "must be <= 65535"
      }
    ],
    "requestId": "2b6b55cf-520e-4e31-8ca0-6420bdfb9a5c",
    "timestamp": "2026-10-18T22:30:00.000Z"
  }
  ```
- **Safety in Production:** Unhandled internal server errors (`500`) log full stack traces internally alongside the unique `requestId`, but emit a sanitized generic message to the client, preventing leakage of internal implementations or database structures.
- **Correlation Tracking:** Incoming `x-request-id` headers are validated against injection patterns (`^[a-zA-Z0-9_-]{1,64}$`) and propagated across all log entries and error responses.

---

## 10. Docker Deployment

### Multi-stage Dockerfile
The container image utilizes a 3-stage build process:
1. `deps`: Caches full dependencies.
2. `builder`: Compiles TypeScript into JavaScript.
3. `runner`: Production image containing only production dependencies, running as non-root user `node` on Alpine Linux with built-in healthchecks.

### Docker Compose
```bash
# Start containerized application
docker compose up -d

# View application logs
docker compose logs -f fastify-api

# Stop container
docker compose down
```

---

## 11. Backend Development Roadmap

| Stage | Focus Area | Status |
|---|---|---|
| **Stage 1** | **Project Foundation (Fastify, TypeScript, Logging, Security, Health, Docs)** | **Implemented (Pending Verification)** |
| Stage 2 | Database Architecture & Prisma ORM Integration (PostgreSQL) | Remaining |
| Stage 3 | Authentication, Session Management & JWT Security | Remaining |
| Stage 4 | Caching Layer & Background Job Processing (Redis, BullMQ) | Remaining |
| Stage 5 | Multi-Store Architecture & Role-Based Access Control (RBAC) | Remaining |
| Stage 6 | Product Catalog, Categories & Barcode Management | Remaining |
| Stage 7 | Inventory Control, Stock Transfers & Audit Tracking | Remaining |
| Stage 8 | Supplier Management, Procurement & Purchase Orders | Remaining |
| Stage 9 | Point of Sale (POS), Sales Orders, Checkout & Payments | Remaining |
| Stage 10 | Analytics, Financial Reporting, Audit Logs & Production Hardening | Remaining |
