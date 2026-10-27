# Production Security Hardening & Audit Checklist — Stage 10

## 1. Overview

This checklist outlines the mandatory security controls, hardening practices, and pre-deployment verifications required before deploying the Store Management System to a public or production environment.

---

## 2. Security Verification Checklist

### A. Authentication & Session Management
- [ ] **Strong Passwords**: Argon2id parameters configured with high memory and time costs (`memoryCost: 65536`, `timeCost: 3`, `parallelism: 4`).
- [ ] **Cryptographic Secrets**: `JWT_ACCESS_SECRET` and `COOKIE_SECRET` are generated using cryptographically strong randomness (`openssl rand -hex 32`) and are at least 32 characters long.
- [ ] **Zero Dev Secrets**: The Zod environment validator enforces that development fallback secrets are rejected when `NODE_ENV=production`.
- [ ] **Short-Lived Access Tokens**: `JWT_ACCESS_TTL` is set to `15m` (maximum `30m`).
- [ ] **Refresh Token Rotation**: Refresh tokens rotate on every `/auth/refresh` invocation; tokens are stored exclusively as SHA-256 hashes in the database.
- [ ] **Replay Detection**: If a previously revoked refresh token is presented, the entire session family is revoked immediately.
- [ ] **Active Session Limits**: Enforces `MAX_ACTIVE_SESSIONS=2` via transactional FIFO eviction.
- [ ] **Cookie Security**: Refresh cookies configured with `HttpOnly`, `SameSite=Strict`, `Secure=true` in production, and cryptographic cookie signing.

### B. Authorization & Access Control
- [ ] **Deny-by-Default**: Unauthenticated requests receive `401 Unauthorized`.
- [ ] **Centralized Permission Enforcement**: Privileged operations require explicit RBAC permissions via `requirePermissions(...)`.
- [ ] **Cross-Store IDOR Protection**: Store-scoped endpoints enforce `requireStoreAccess`, rejecting cross-store access attempts with `403 Forbidden`.
- [ ] **Final Administrator Safeguard**: System prevents deactivating or removing the last active `SUPER_ADMIN`.

### C. Network & HTTP Hardening
- [ ] **HTTP Security Headers**: `@fastify/helmet` applies `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- [ ] **Strict CORS Policy**: `CORS_ORIGINS` explicitly lists allowed frontend origins. Wildcard `*` origins are rejected in production mode.
- [ ] **Rate Limiting**: Rate limiting applied via `@fastify/rate-limit` with strict quotas on sensitive authentication and payment endpoints.
- [ ] **Request Body Limits**: Request size bounded by `BODY_LIMIT_BYTES=1048576` (1MB).
- [ ] **Proxy Trust**: `TRUST_PROXY=true` configured when running behind reverse proxies so client IP addresses cannot be spoofed.
- [ ] **Swagger UI Disabled**: `SWAGGER_ENABLED=false` in production to prevent public exposure of internal API specifications.

### D. Data Protection & Log Sanitization
- [ ] **Zero Credentials in Code**: No secrets, passwords, or connection strings are committed to version control.
- [ ] **Pino Redaction**: Expanded redaction paths redact payment card numbers, CVVs, PINs, tokens, passwords, password hashes, and Redis/database credentials.
- [ ] **Error Sanitization**: Centralized error handler catches unhandled exceptions and returns sanitized JSON responses without SQL queries or internal stack traces.
- [ ] **Container Isolation**: Docker container runs as non-root user `node` (UID 1000) with `tini` as init process.

### E. Financial & Inventory Invariants
- [ ] **Authoritative Pricing**: Checkout prices are derived server-side from active catalog variant prices; client-provided prices are ignored.
- [ ] **Exact Decimal Precision**: All calculations for monetary amounts and stock quantities utilize `Prisma.Decimal` preventing IEEE 754 floating-point errors.
- [ ] **Deadlock Prevention**: Variant IDs in multi-item orders are sorted lexicographically before acquiring row locks (`SELECT ... FOR UPDATE`).
- [ ] **Stock Non-Negativity**: Available stock quantities cannot drop below zero.
- [ ] **Refund Caps**: Refunds cannot exceed the eligible captured amount of the parent payment transaction.
