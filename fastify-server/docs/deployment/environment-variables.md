# Environment Variables & Secrets Reference — Stage 10

## 1. Overview

The application validates all configuration variables during process startup using **Zod** (`src/config/env.ts`). If any required variable is missing, malformed, or insecure for the active `NODE_ENV`, the process aborts immediately with a clear, sanitized error message without leaking sensitive values.

---

## 2. Environment Variables Specification

### A. Core Application & Server

| Variable | Type | Default | Required in Prod | Description |
|---|---|---|---|---|
| `NODE_ENV` | `development \| test \| production` | `development` | Yes | Controls logging formats, security header enforcements, and secret validation |
| `APP_NAME` | `string` | `store-management-system` | No | Identifier used in structured log contexts and metrics |
| `HOST` | `string` | `0.0.0.0` | No | Network interface bound by Fastify |
| `PORT` | `number (1-65535)` | `3000` | No | HTTP listening port |
| `LOG_LEVEL` | `fatal \| error \| warn \| info \| debug \| trace \| silent` | `info` | No | Minimum Pino severity level logged to stdout |
| `API_PREFIX` | `string` | `/api/v1` | No | Route prefix for all REST endpoints |
| `API_PUBLIC_URL` | `string (URL)` | `undefined` | No | Public base URL used in generated receipt links and notifications |
| `TRUST_PROXY` | `boolean` | `false` | Recommended (`true`) | When behind Nginx, AWS ALB, or Cloudflare, set to `true` to parse `X-Forwarded-*` |
| `BODY_LIMIT_BYTES` | `number` | `1048576` (1MB) | No | Maximum JSON request body size in bytes |
| `REQUEST_TIMEOUT_MS` | `number` | `15000` (15s) | No | Maximum execution duration before timing out an HTTP connection |
| `SHUTDOWN_TIMEOUT_MS` | `number` | `10000` (10s) | No | Hard process kill deadline during graceful termination |
| `CORS_ORIGINS` | `string` (comma-separated) | `http://localhost:3000,http://localhost:5173` | Yes | Allowed origins. **Wildcards (`*`) are strictly rejected in production** |
| `SWAGGER_ENABLED` | `boolean` | `false` in prod, `true` in dev | No | Enables OpenAPI Swagger UI at `/docs`. Must be disabled in public production |

### B. PostgreSQL & Prisma Persistence

| Variable | Type | Default | Required in Prod | Description |
|---|---|---|---|---|
| `DATABASE_URL` | `string (postgresql://)` | `postgresql://...` | Yes | Pooled PostgreSQL connection string for API and worker runtime |
| `DATABASE_DIRECT_URL` | `string (postgresql://)` | `undefined` | Optional | Direct connection string for migration runners when using PgBouncer / Neon |
| `DB_POOL_MAX` | `number (1-100)` | `10` | No | Maximum concurrent client connections in the `pg.Pool` connection pool |
| `DB_CONNECTION_TIMEOUT_MS` | `number` | `5000` (5s) | No | Socket connection timeout in milliseconds before raising a database error |

### C. Authentication, JWT & Session Security

| Variable | Type | Default | Required in Prod | Description |
|---|---|---|---|---|
| `JWT_ACCESS_SECRET` | `string (min 32 chars)` | `dev-jwt-access-secret...` | Yes | HS256 secret key. **Default dev value is strictly rejected in production** |
| `JWT_ACCESS_TTL` | `string (regex: ^[0-9]+[smhd]$)` | `15m` | No | Access token expiration duration |
| `JWT_ISSUER` | `string` | `store-management-system` | No | JWT `iss` claim for signature validation |
| `JWT_AUDIENCE` | `string` | `store-management-system-api` | No | JWT `aud` claim for signature validation |
| `REFRESH_TOKEN_TTL_DAYS` | `number (1-90)` | `7` | No | Refresh token validity window in days before hard expiration |
| `MAX_ACTIVE_SESSIONS` | `number (1-10)` | `2` | No | Maximum concurrent active sessions per user (FIFO session eviction) |
| `AUTH_COOKIE_NAME` | `string` | `refresh_token` | No | Name of the secure, HttpOnly cookie transporting the refresh token |
| `COOKIE_SECRET` | `string (min 32 chars)` | `dev-cookie-secret...` | Yes | Secret for signing Fastify cookies. **Default dev value rejected in prod** |

### D. Redis Caching, Queues & Background Jobs

| Variable | Type | Default | Required in Prod | Description |
|---|---|---|---|---|
| `REDIS_URL` | `string (redis:// or rediss://)` | `redis://localhost:6379` | Yes | Redis connection string for standalone or cluster configurations |
| `REDIS_HOST` | `string` | `localhost` | No | Redis hostname |
| `REDIS_PORT` | `number (1-65535)` | `6379` | No | Redis TCP port |
| `REDIS_PASSWORD` | `string` | `undefined` | Recommended | Redis authentication password (`requirepass`) |
| `REDIS_TLS_ENABLED` | `boolean` | `false` | Optional | Enables TLS socket encryption for cloud-managed Redis (AWS ElastiCache) |
| `REDIS_CONNECT_TIMEOUT_MS` | `number` | `5000` (5s) | No | Redis socket connection timeout in milliseconds |
| `REDIS_MAX_RETRIES_PER_REQUEST` | `number (0-20)` | `3` | No | Maximum command retries before triggering fail-open fallback |
| `CACHE_DEFAULT_TTL_SECONDS` | `number` | `300` (5m) | No | Default TTL for cached business records |
| `CACHE_CATALOG_TTL_SECONDS` | `number` | `600` (10m) | No | TTL for product catalog reference data |
| `CACHE_STORE_TTL_SECONDS` | `number` | `1800` (30m) | No | TTL for store metadata and taxonomy records |
| `WORKER_CONCURRENCY` | `number (1-50)` | `5` | No | Concurrent jobs processed simultaneously by a single worker instance |
| `WORKER_ENABLED` | `boolean` | `false` | Yes (`true` on worker) | Activates BullMQ worker processing in the target process |

---

## 3. Secret Management & Rotation Procedures

### 3.1 Secret Storage
- **Local Development**: `.env` file (strictly excluded from Git via `.gitignore`).
- **CI/CD Pipelines**: Injected securely via GitHub Secrets or GitLab CI Variables.
- **Production Infrastructure**: Injected at container startup via AWS Secrets Manager, HashiCorp Vault, Kubernetes Secrets, or Docker Secrets. Secrets must **never** be baked into Docker images.

### 3.2 Secret Rotation Runbooks

#### Rotating `JWT_ACCESS_SECRET`
Because access tokens are short-lived (`15m`), rotating `JWT_ACCESS_SECRET` invalidates all outstanding access tokens immediately.
1. Generate a new cryptographically secure 64-character secret:
   ```bash
   openssl rand -hex 32
   ```
2. Update the secret in the secrets store and trigger a rolling restart of the API containers.
3. Users will automatically use their long-lived refresh token (`7d`) to obtain a new access token signed with the new secret without requiring credential re-entry.

#### Rotating `DATABASE_URL` Credentials
1. Create a secondary database user in PostgreSQL with identical permissions.
2. Update `DATABASE_URL` in the secrets manager to point to the new user.
3. Perform a zero-downtime rolling restart of the API and Worker containers.
4. Verify connections on the new credentials via `/health/ready`.
5. Deprecate and drop the old database user credentials.
