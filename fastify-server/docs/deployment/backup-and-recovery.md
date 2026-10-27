# Backup, Disaster Recovery & Data Integrity Guide — Stage 10

## 1. Overview & Recovery Objectives

The Store Management System persists all authoritative state in **PostgreSQL 17**. Redis serves as an ephemeral cache accelerator and volatile job queue.

### Recovery Metrics (Target Objectives)
- **Recovery Point Objective (RPO)**: Target $\le 1$ hour (maximum acceptable data loss window during a disaster).
- **Recovery Time Objective (RTO)**: Target $\le 2$ hours (maximum acceptable time to restore service after catastrophic infrastructure failure).

> *Note: These are deployment operational targets to be chosen by infrastructure operators, rather than pre-existing guarantees.*

---

## 2. PostgreSQL Backup Strategy

### 2.1 Backup Tiers
1. **Continuous WAL Archiving & Point-in-Time Recovery (PITR)**:
   - Archive Write-Ahead Logs (`pg_wal`) to an offsite S3-compatible bucket via `pgBackRest` or `WAL-G`.
   - Enables restoring the database to any millisecond within the retention window.
2. **Automated Daily Logical Dumps (`pg_dump`)**:
   - Run daily compressed custom-format dumps (`-F c`) outside peak operating hours (e.g. 02:00 UTC).
   - Encrypted with AES-256 and transferred to immutable, access-controlled cloud object storage.

### 2.2 Backup Schedule & Retention Policy

| Backup Type | Execution Frequency | Retention Window | Storage Tier |
|---|---|---|---|
| **WAL Archives** | Continuous (every 5m) | 7 Days | Hot Cloud Storage (S3 / GCS) |
| **Daily Full Dump** | Every 24 hours | 14 Days | Standard Cloud Storage |
| **Weekly Snapshot** | Every Sunday | 8 Weeks | Infrequent Access Storage |
| **Monthly Archive** | 1st of each month | 12 Months | Glacier / Cold Archive |

---

## 3. Database Restoration Procedures

### 3.1 Restoring from Logical Dump (`pg_restore`)
```bash
# 1. Stop API and Worker containers to prevent concurrent writes
docker compose -f docker-compose.prod.yml stop fastify-api fastify-worker

# 2. Terminate existing database connections
psql -U postgres -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'store_management' AND pid <> pg_backend_pid();"

# 3. Drop and recreate clean database
dropdb -U postgres store_management
createdb -U postgres -O postgres store_management

# 4. Restore data using pg_restore with clean schema
pg_restore -U postgres -d store_management --clean --if-exists --no-owner --no-privileges -v /backups/store_management_20261025.dump

# 5. Restart application services
docker compose -f docker-compose.prod.yml start fastify-api fastify-worker
```

### 3.2 Post-Restore Data Integrity Verification
After a database restoration, run sanity queries to verify financial and inventory consistency:
```sql
-- 1. Verify inventory balance non-negativity
SELECT id, "storeId", "variantId", "quantityOnHand", "availableQuantity"
FROM inventory_balances
WHERE "quantityOnHand" < 0 OR "availableQuantity" < 0;

-- 2. Verify payment vs sale totals alignment
SELECT s.id, s."totalAmount", COALESCE(SUM(p."amount"), 0) AS "totalPaid"
FROM sales s
LEFT JOIN payments p ON s.id = p."saleId" AND p.status = 'COMPLETED'
WHERE s.status = 'COMPLETED'
GROUP BY s.id
HAVING s."totalAmount" <> COALESCE(SUM(p."amount"), 0);
```

---

## 4. Redis & Queue Recovery Considerations

Redis is strictly **ephemeral**:
- **Cache Data**: Stored in Redis keys under `v1:*`. If Redis crashes or experiences data loss, the cache-aside pattern automatically rehydrates cache entries from PostgreSQL on subsequent queries.
- **Queue Jobs**: BullMQ queues (`reports`, `reconciliation`, `cleanup`) store transient job state in Redis.
  - To prevent queue data loss during container restarts, Redis runs with `--appendonly yes` (`AOF`) in production.
  - If Redis storage is lost, background tickets (`report_requests`) and outbox records (`outbox_events`) in PostgreSQL remain the authoritative ledger of record. The `CleanupWorker` and `ReconciliationWorker` can safely re-queue orphaned tasks from PostgreSQL.

---

## 5. Investigating Inconsistent Payment or Inventory States

If an external digital payment webhook was missed or a network partition occurred during checkout:
1. **Query Stale Pending Sales**:
   ```sql
   SELECT id, "storeId", status, "totalAmount", "createdAt"
   FROM sales
   WHERE status = 'PENDING' AND "createdAt" < NOW() - INTERVAL '1 hour';
   ```
2. **Review Reconciliation Logs**:
   Inspect `ReconciliationWorker` logs:
   ```bash
   docker logs store-management-fastify-worker-prod | grep -E "reconciliation|payment"
   ```
3. **Manual Settlement / Voiding**:
   Use authorized payment management routes (`POST /api/v1/payments/:id/capture` or `POST /api/v1/payments/:id/void`) to reconcile the transaction with authoritative payment gateway records.
