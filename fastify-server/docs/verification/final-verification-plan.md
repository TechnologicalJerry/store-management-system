# Final Verification Plan — Post-Stage 10 Execution Checklist

## 1. Overview & Execution Rules

Throughout Stages 1 through 10, all terminal commands, package installations, database migrations, tests, builds, and container runs were strictly prohibited to guarantee a clean, code-only implementation phase.

This document serves as the **authoritative verification plan** to be executed in the separately planned **Final Verification Phase**.

> **Mandatory Rule:** In accordance with the project guidelines, every item in this checklist is initially marked as **Not run**. No commands have been executed during Stage 10.

---

## 2. Verification Checklist

### A. Environment & Dependency Verification

| ID | Verification Action | Command / Procedure | Prerequisite | Expected Result | Status |
|---|---|---|---|---|---|
| **ENV-01** | Verify Node.js LTS version | `node --version` | Terminal access | Reports Node.js `>=20.0.0` (Recommended `v22.x`) | **Not run** |
| **ENV-02** | Install dependencies from lockfile | `npm ci` | Clean repo checkout | Installs all production and dev dependencies matching `package-lock.json` | **Not run** |
| **ENV-03** | Verify environment schema validation | `tsx -e "import { loadEnv } from './src/config/env.js'; loadEnv();"` | `.env.example` copied to `.env` | Successfully parses configuration or throws formatted errors | **Not run** |
| **ENV-04** | Verify production secret rejection | `NODE_ENV=production tsx -e "import { loadEnv } from './src/config/env.js'; loadEnv();"` | Default dev secrets in `.env` | Throws validation error rejecting default `JWT_ACCESS_SECRET` / `COOKIE_SECRET` | **Not run** |

---

### B. Code Quality & Static Analysis

| ID | Verification Action | Command / Procedure | Prerequisite | Expected Result | Status |
|---|---|---|---|---|---|
| **QUAL-01** | Verify code formatting | `npm run format:check` | Dependencies installed | All TypeScript and configuration files pass Prettier checks | **Not run** |
| **QUAL-02** | Run ESLint verification | `npm run lint` | Dependencies installed | Zero ESLint errors across `src/` and `tests/` | **Not run** |
| **QUAL-03** | TypeScript strict compilation check | `npm run typecheck` | Dependencies installed | Zero TypeScript compilation errors (`tsc --noEmit`) | **Not run** |
| **QUAL-04** | Production application build | `npm run build` | Prisma generated | Successfully compiles TypeScript into `dist/` with zero errors | **Not run** |

---

### C. Database & Prisma Verification

| ID | Verification Action | Command / Procedure | Prerequisite | Expected Result | Status |
|---|---|---|---|---|---|
| **DB-01** | Prisma client generation | `npm run prisma:generate` | Dependencies installed | Generates typed Prisma client in `node_modules/.prisma` | **Not run** |
| **DB-02** | Check migration status | `npm run prisma:migrate:status` | PostgreSQL 17 running | Reports all migrations applied or pending cleanly | **Not run** |
| **DB-03** | Apply migrations to test DB | `npm run prisma:migrate:deploy` | Fresh PostgreSQL database | Executes all 7 migration SQL files without errors | **Not run** |
| **DB-04** | Verify developmental seeding | `npm run db:seed` | Applied migrations (dev DB only) | Inserts test categories, products, stores, and users | **Not run** |
| **DB-05** | Verify database constraints | Inspect PostgreSQL information schema | Seeded database | Foreign keys, unique constraints, and check constraints active | **Not run** |

---

### D. Automated Test Suite Execution

| ID | Verification Action | Command / Procedure | Prerequisite | Expected Result | Status |
|---|---|---|---|---|---|
| **TEST-01** | Execute all automated tests | `npm run test` | Dependencies installed | All unit and integration test suites pass | **Not run** |
| **TEST-02** | Security regression tests | `npx vitest run tests/unit/security-regression.test.ts` | Dependencies installed | IDOR, privilege escalation, and token tampering tests pass | **Not run** |
| **TEST-03** | Transaction integrity tests | `npx vitest run tests/unit/transaction-integrity.test.ts` | Dependencies installed | Deadlock sorting, stock rollback, and decimal precision tests pass | **Not run** |
| **TEST-04** | Operational metrics tests | `npx vitest run tests/unit/metrics.service.test.ts` | Dependencies installed | Metrics tracking and Prometheus formatting tests pass | **Not run** |
| **TEST-05** | Health & diagnostics route tests | `npx vitest run tests/integration/health-diagnostics.routes.test.ts` | Dependencies installed | Liveness, readiness, fail-open, and diagnostics tests pass | **Not run** |
| **TEST-06** | Security headers & CORS tests | `npx vitest run tests/integration/security.routes.test.ts` | Dependencies installed | Helmet headers, CORS allowlist, and sanitized error responses pass | **Not run** |
| **TEST-07** | Reporting & cache tests | `npx vitest run tests/integration/reports.routes.test.ts` | Dependencies installed | Aggregation calculations and cache invalidation tests pass | **Not run** |
| **TEST-08** | Background worker tests | `npx vitest run tests/unit/worker.test.ts` | Dependencies installed | BaseWorker, report, reconciliation, and cleanup jobs pass | **Not run** |

---

### E. Runtime & Process Integration

| ID | Verification Action | Command / Procedure | Prerequisite | Expected Result | Status |
|---|---|---|---|---|---|
| **RUN-01** | API server dev startup | `npm run dev` | PostgreSQL & Redis up | API starts, listens on port 3000, logs startup banner | **Not run** |
| **RUN-02** | Standalone worker dev startup | `npm run dev:worker` | PostgreSQL & Redis up | Worker starts, initializes queues, logs operational status | **Not run** |
| **RUN-03** | Compiled API prod startup | `node dist/server.js` | Production build complete | API starts cleanly from compiled JavaScript artifacts | **Not run** |
| **RUN-04** | Compiled worker prod startup | `node dist/worker.js` | Production build complete | Worker starts cleanly from compiled JavaScript artifacts | **Not run** |
| **RUN-05** | API graceful termination | Send `SIGTERM` to running API process | Running API process | Drains requests and exits with code 0 within 10 seconds | **Not run** |
| **RUN-06** | Worker graceful termination | Send `SIGTERM` to running worker process | Running worker process | Drains jobs and disconnects queues with code 0 | **Not run** |
| **RUN-07** | Liveness probe check | `curl -f http://127.0.0.1:3000/api/v1/health/live` | Running API | Returns `200 OK` with JSON `{"status":"alive"}` | **Not run** |
| **RUN-08** | Readiness probe check | `curl -f http://127.0.0.1:3000/api/v1/health/ready` | Running API + DB + Redis | Returns `200 OK` with JSON `{"status":"ready"}` | **Not run** |
| **RUN-09** | Fail-open readiness check | Stop Redis, query `/api/v1/health/ready` | Running API + DB (Redis stopped) | Returns `200 OK` with `{"status":"degraded"}` | **Not run** |
| **RUN-10** | Metrics scrape check | `curl -H "Accept: text/plain" http://127.0.0.1:3000/api/v1/health/metrics` | Running API | Returns standard Prometheus plain text metrics payload | **Not run** |
| **RUN-11** | Interactive Swagger UI check | `curl -I http://127.0.0.1:3000/docs` | `SWAGGER_ENABLED=true` | Returns `200 OK` loading OpenAPI interface | **Not run** |

---

### F. Security & Vulnerability Auditing

| ID | Verification Action | Command / Procedure | Prerequisite | Expected Result | Status |
|---|---|---|---|---|---|
| **SEC-01** | Dependency vulnerability scan | `npm audit --audit-level=high` | Dependencies installed | Zero high or critical known vulnerabilities | **Not run** |
| **SEC-02** | Log redaction audit | Submit checkout request with test card details | Running API | Card PAN, CVV, and PIN appear masked as `[REDACTED]` in logs | **Not run** |
| **SEC-03** | Error sanitization audit | Trigger 500 error via invalid route | Running API | Response contains sanitized error code; no SQL or stack traces | **Not run** |
| **SEC-04** | Rate-limiting audit | Fire 101 requests within 60s to `/api/v1/auth/login` | Running API | 101st request receives `429 Too Many Requests` | **Not run** |
| **SEC-05** | Cross-store access audit | Call Store B inventory route with Store A token | Running API | Receives `403 Forbidden` (`INSUFFICIENT_PERMISSIONS`) | **Not run** |
| **SEC-06** | Session limit audit | Authenticate 3 consecutive times with same user | Running API | First session is revoked (FIFO eviction, max 2 active sessions) | **Not run** |

---

### G. Deployment & Containerization Verification

| ID | Verification Action | Command / Procedure | Prerequisite | Expected Result | Status |
|---|---|---|---|---|---|
| **DEP-01** | Build production Docker image | `docker build -t store-management-fastify:test .` | Docker daemon running | Builds multi-stage image with non-root user and `tini` | **Not run** |
| **DEP-02** | Validate image vulnerability scan | `docker scout cves store-management-fastify:test` | Docker scout / Trivy | Zero critical CVEs in base Node 22 Alpine image | **Not run** |
| **DEP-03** | Full Compose prod startup | `docker compose -f docker-compose.prod.yml up -d` | Docker daemon running | Starts PostgreSQL, Redis, migration runner, API, and worker | **Not run** |
| **DEP-04** | Container health checks | `docker compose -f docker-compose.prod.yml ps` | Running Compose stack | All services report `healthy` | **Not run** |
| **DEP-05** | Network isolation check | `nc -zv 127.0.0.1 5432` and `nc -zv 127.0.0.1 6379` | Running prod compose | Ports 5432 and 6379 are closed on host (isolated to Docker network) | **Not run** |
| **DEP-06** | CI workflow execution | Push branch to trigger GitHub Actions CI | GitHub repository | All CI jobs (lint, typecheck, test, build, docker-build) succeed | **Not run** |
