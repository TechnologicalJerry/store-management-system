# Operations & Alerting Runbook — Stage 10

## 1. Overview

This runbook specifies operational metrics, alert thresholds, log query recipes, and incident response procedures for site reliability engineers (SREs) maintaining the Store Management System backend in production.

---

## 2. Recommended Alert Rules

The following thresholds should be configured in Prometheus Alertmanager, Datadog, or CloudWatch:

| Alert Name | Severity | Condition / PromQL | Action Required |
|---|---|---|---|
| **HighHttp5xxErrorRate** | Critical | `sum(rate(http_requests_total{status_code=~"5.."}[5m])) / sum(rate(http_requests_total[5m])) > 0.01` (Errors > 1% for 5m) | Check API logs for unhandled exceptions or database connection pool exhaustion. |
| **HighRequestLatency** | Warning | `http_request_duration_avg_ms > 500` for 5 consecutive minutes | Inspect database slow queries and cache miss rates. |
| **DatabaseConnectionFailure** | Critical | `health_readiness_status{dependency="database"} == 0` for 1m | Inspect PostgreSQL container health, disk space, and network connectivity. |
| **RedisDegraded** | Warning | `health_readiness_status{dependency="redis"} == 0` for 3m | Inspect Redis container health. Cache falls back gracefully to DB. |
| **QueueBacklogGrowing** | Warning | `queue_waiting_jobs_count > 100` for 10 consecutive minutes | Scale up `fastify-worker` instances or check for hung workers. |
| **HighWorkerFailureRate** | Critical | `rate(queue_failed_jobs_total[5m]) > 5` for 5m | Inspect worker error logs (`ReportWorker`, `ReconciliationWorker`). |
| **DiskSpaceLow** | Critical | Host filesystem disk space available $< 15\%$ | Purge old docker images, truncate rotated logs, or expand volume. |

---

## 3. Log Analysis Recipes (Pino JSON Logs)

Pino outputs newline-delimited JSON (NDJSON) to `stdout`. Use `jq` to filter and analyze operational logs:

### 3.1 Filter Unhandled Server Errors (Level 50 & 60)
```bash
docker logs store-management-fastify-api-prod | jq 'select(.level >= 50) | {time, msg, err, reqId: .reqId}'
```

### 3.2 Trace a Specific Request by `X-Request-ID`
```bash
docker logs store-management-fastify-api-prod | jq 'select(.reqId == "req-550e8400-e29b-41d4-a716-446655440000")'
```

### 3.3 Find Slow HTTP Responses ($> 500\text{ms}$)
```bash
docker logs store-management-fastify-api-prod | jq 'select(.responseTime > 500) | {time, method: .req.method, url: .req.url, responseTime, status: .res.statusCode}'
```

### 3.4 Inspect Worker Job Processing Failures
```bash
docker logs store-management-fastify-worker-prod | jq 'select(.err != null) | {time, msg, err, queue}'
```

---

## 4. Common Incident Triage Procedures

### Scenario A: High API Error Rate (500 Internal Server Errors)
1. Query administrative diagnostics:
   ```bash
   curl -H "Authorization: Bearer <ADMIN_TOKEN>" http://127.0.0.1:3000/api/v1/health/diagnostics
   ```
2. Check if PostgreSQL connections are saturated:
   ```sql
   SELECT count(*), state FROM pg_stat_activity GROUP BY state;
   ```
3. If pool is exhausted, increase `DB_POOL_MAX` (e.g. from 10 to 25) in environment configuration and restart the API container.

### Scenario B: Background Reports Failing or Timed Out
1. Check worker container logs:
   ```bash
   docker logs --tail 200 store-management-fastify-worker-prod
   ```
2. Verify Redis queue connectivity:
   ```bash
   docker exec -it store-management-redis-prod redis-cli ping
   ```
3. Inspect pending report request tickets in the database:
   ```sql
   SELECT id, "storeId", type, status, "attemptsMade", "errorMessage", "createdAt"
   FROM report_requests
   WHERE status IN ('PENDING', 'PROCESSING', 'FAILED')
   ORDER BY "createdAt" DESC LIMIT 20;
   ```

### Scenario C: High Event Loop Lag / High Memory Utilization
1. Check container resource consumption:
   ```bash
   docker stats store-management-fastify-api-prod store-management-fastify-worker-prod
   ```
2. Inspect Prometheus metrics endpoint for request volume anomalies:
   ```bash
   curl -H "Accept: text/plain" http://127.0.0.1:3000/api/v1/health/metrics
   ```
3. If memory is climbing continuously without returning to baseline, restart container and inspect memory profiling snapshots.
