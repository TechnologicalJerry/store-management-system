# Production Setup & Deployment Guide — Stage 10

## 1. System Architecture

The Store Management System backend is structured as a **modular monolith** with decoupled runtime roles:
- **API Server Process (`src/server.ts` -> `dist/server.js`)**: Serves HTTP/REST client traffic, enforces authentication and RBAC, executes transactional database operations, and dispatches background work to queues. It does **not** process asynchronous jobs.
- **Background Worker Process (`src/worker.ts` -> `dist/worker.js`)**: Headless worker processing asynchronous report compilation, stale payment session reconciliation, and periodic cleanup jobs. It does **not** expose HTTP ports.
- **Database (`PostgreSQL 17`)**: Primary authoritative state store, utilizing connection pooling (`@prisma/adapter-pg` + `pg.Pool`).
- **Cache & Message Broker (`Redis 7.4`)**: Ephemeral acceleration cache and FIFO background job queues. Redis operates under a **fail-open** model for caching; if Redis degrades or restarts, the API continues serving authoritative database traffic without failing readiness checks.

```
                    ┌─────────────────────────┐
                    │  Internet / Ingress     │
                    └────────────┬────────────┘
                                 │ HTTPS (Port 443)
                    ┌────────────▼────────────┐
                    │ Reverse Proxy / Gateway │ (Nginx, Caddy, AWS ALB)
                    │ SSL, Rate-Limits, Infr  │
                    └────────────┬────────────┘
                                 │ HTTP (Port 3000)
                    ┌────────────▼────────────┐
                    │     Fastify API         │ (dist/server.js)
                    │  (Stateless Replicas)   │
                    └───────┬──────────┬──────┘
                            │          │
                 Read/Write │          │ Cache-Aside / Enqueue
                            │          │
         ┌──────────────────▼──┐    ┌──▼──────────────────┐
         │    PostgreSQL 17    │    │      Redis 7.4      │
         │ (Authoritative DB)  │    │ (Cache & Job Queue) │
         └──────────────────┬──┘    └──┬──────────────────┘
                            ▲          ▲
                 Read/Write │          │ Dequeue Jobs
                            │          │
                    ┌───────┴──────────┴──────┐
                    │   Standalone Worker     │ (dist/worker.js)
                    │   (Reports, Reconcile)  │
                    └─────────────────────────┘
```

---

## 2. Infrastructure Prerequisites

| Component | Recommended Version | Minimum Sizing | Production Role |
|---|---|---|---|
| **Node.js** | `v22.x` (LTS) | 1 vCPU, 512MB RAM | Runtime environment for API and Worker containers |
| **PostgreSQL** | `17.x` | 2 vCPU, 2GB RAM, SSD | Relational database, transactions, row-level locks |
| **Redis** | `7.4` (Alpine) | 1 vCPU, 256MB RAM | Ephemeral cache, distributed job queues |
| **Reverse Proxy** | Nginx / Caddy / Traefik | 1 vCPU, 256MB RAM | TLS termination, header proxying, gzip compression |

---

## 3. Deployment Topology & Options

### Option A: Docker Compose Deployment (Recommended for Single-Host VM)
A hardened production Compose specification is provided at [`docker-compose.prod.yml`](file:///d:/GitHub/store-management-system/fastify-server/docker-compose.prod.yml):
- PostgreSQL and Redis have **no published host ports**, restricting access strictly to the internal Docker network.
- A one-shot `prisma-migrate` container automatically applies pending database migrations via `prisma migrate deploy` prior to launching API and Worker services.
- Containers enforce memory limits (512MB) and CPU allocations (1.0).
- Docker logging is bounded with `json-file` rotation (max 20MB, 5 files).

```bash
# Production launch command (requires .env populated with secure secrets)
docker compose -f docker-compose.prod.yml up -d
```

### Option B: Kubernetes / Cloud Container Deployment
When deploying to Kubernetes or cloud container platforms (AWS ECS, Google Cloud Run, Azure Container Apps):
1. **Migration Job**: Execute `npx prisma migrate deploy` as a pre-deployment Job or Helm pre-install/pre-upgrade hook.
2. **API Deployment**: Deploy `store-management-fastify` with `CMD ["node", "dist/server.js"]`. Set horizontal pod autoscaling (HPA) targeting 70% CPU utilization.
3. **Worker Deployment**: Deploy `store-management-fastify` with `CMD ["node", "dist/worker.js"]`. Scale independently based on queue backlog metrics.
4. **Ingress / Service**: Route external HTTPS traffic to port `3000` of the API pods. Do not route traffic to the worker pods.

---

## 4. Reverse Proxy Configuration (Nginx)

The API process must run behind a reverse proxy that terminates TLS, applies request size limits, and securely forwards client IP addresses:

```nginx
upstream fastify_backend {
    server 127.0.0.1:3000 max_fails=3 fail_timeout=10s;
    keepalive 32;
}

server {
    listen 443 ssl http2;
    server_name api.store.example.com;

    ssl_certificate     /etc/ssl/certs/store_api.crt;
    ssl_certificate_key /etc/ssl/private/store_api.key;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    # Maximum client payload size (aligned with BODY_LIMIT_BYTES=1048576)
    client_max_body_size 1m;

    # Security headers
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://fastify_backend;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Request-ID $request_id;

        proxy_connect_timeout 5s;
        proxy_read_timeout 15s;
        proxy_send_timeout 15s;
    }

    # Restrict administrative diagnostics
    location /api/v1/health/diagnostics {
        allow 10.0.0.0/8;       # Internal VPN / VPC
        allow 172.16.0.0/12;
        deny all;
        proxy_pass http://fastify_backend;
    }
}
```

> **Important**: When running behind Nginx or AWS ALB, ensure `TRUST_PROXY=true` is set in the application environment so that Fastify extracts client IP addresses accurately for rate-limiting and audit logging.

---

## 5. Health Check Probes Configuration

| Probe Endpoint | Target Workload | Expected Status | Fail Behavior |
|---|---|---|---|
| `GET /api/v1/health/live` | Kubernetes Liveness Probe | `200 OK` | Container restart |
| `GET /api/v1/health/ready` | Kubernetes Readiness Probe / Load Balancer | `200 OK` (Healthy or Degraded) | Traffic ceased if PostgreSQL down |
| `GET /api/v1/health/diagnostics` | Internal Admin / SRE Monitoring | `200 OK` (Protected by RBAC) | Diagnostic inspection |
| `GET /api/v1/health/metrics` | Prometheus Scraper (`Accept: text/plain`) | `200 OK` | Metrics compilation |

---

## 6. Process Lifecycle & Graceful Shutdown

Both the API and Worker processes register handlers for `SIGTERM` and `SIGINT`:
- **API (`dist/server.js`)**: Stops accepting new connections, allows in-flight HTTP requests to complete within `REQUEST_TIMEOUT_MS` (15s), closes Prisma and Redis connection pools, and enforces a hard deadline of `SHUTDOWN_TIMEOUT_MS` (10s) before terminating.
- **Worker (`dist/worker.js`)**: Stops polling queues, drains active jobs with a bounded 10-second drain window, and disconnects database and Redis connections cleanly.
