# Database Migrations & Deployment Strategy — Stage 10

## 1. Overview

The Store Management System uses **Prisma ORM** (`prisma/schema.prisma`) with declarative SQL migration files stored under `prisma/migrations/`.

In production environments, schema evolution follows strict engineering safeguards:
- **Never Run `prisma migrate dev` in Production:** `migrate dev` creates new migrations and may prompt for database resets. Only `prisma migrate deploy` is permitted in production.
- **Decoupled Migration Execution:** Schema migrations must **never** run automatically inside the long-running API or Worker processes. Migrations are executed as an isolated pre-deployment job or one-shot container (`prisma-migrate`).
- **Transactional Migrations:** Every migration runs within a single PostgreSQL transaction (`BEGIN ... COMMIT`) to ensure atomicity. If any DDL statement fails, the entire migration rolls back cleanly.

---

## 2. Migration Inventory & History

The repository maintains an immutable migration lineage reflecting Stages 1 through 8:

| Migration Directory | Applied Stage | Core Database Objects Created |
|---|---|---|
| `20261019000000_init_foundation` | Stage 1 | Foundational system settings |
| `20261020000000_add_auth_models` | Stage 3 | `users`, `sessions`, `refresh_tokens`, role enums |
| `20261021000000_add_store_and_catalog_models` | Stage 4 | `stores`, `store_memberships`, `categories`, `products`, `product_variants` |
| `20261022000000_add_inventory_models` | Stage 5 | `inventory_balances`, `inventory_movements`, `inventory_transfers`, `transfer_items` |
| `20261023000000_add_procurement_models` | Stage 6 | `suppliers`, `supplier_variants`, `purchase_orders`, `purchase_order_items`, `goods_receipts` |
| `20261024000000_add_sales_and_payment_models` | Stage 7 | `sales`, `sale_items`, `payments`, `refunds`, `receipts` |
| `20261025000000_add_reporting_and_job_models` | Stage 8 | `report_requests`, `outbox_events` |

---

## 3. Production Migration Procedure

### Step 1: Pre-Migration Backup
Before running migrations on production databases, take a point-in-time snapshot or full logical dump:
```bash
pg_dump -h db.store.example.com -U postgres -d store_management -F c -b -v -f /backups/pre_migration_$(date +%Y%m%d_%H%M%S).dump
```

### Step 2: Inspect Migration Status
Verify which migrations are pending application:
```bash
npx prisma migrate status
```

### Step 3: Apply Pending Migrations
Execute the migration command against the target database:
```bash
# Using direct connection string (essential when behind connection poolers like PgBouncer)
DATABASE_URL="$DATABASE_DIRECT_URL" npx prisma migrate deploy
```

In the Docker deployment, this is handled automatically via the `prisma-migrate` service in [`docker-compose.prod.yml`](file:///d:/GitHub/store-management-system/fastify-server/docker-compose.prod.yml).

### Step 4: Validate Application Startup
Confirm that the API starts and passes readiness checks:
```bash
curl -f http://127.0.0.1:3000/api/v1/health/ready
```

---

## 4. Multi-Step Migration Pattern (Zero-Downtime Deployments)

To eliminate downtime during breaking schema changes (e.g. column renames, type changes, column removals), apply the **Expand and Contract (Parallel Run)** pattern across distinct deployment phases:

```
Phase 1 (Expand)        Phase 2 (Dual-Write)      Phase 3 (Backfill)      Phase 4 (Contract)
┌─────────────────┐    ┌────────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Add new column  │    │ Deploy app writing │    │ Backfill legacy  │    │ Deploy app read │
│ (nullable/deflt)│ ──>│ to both old & new  │ ──>│ rows into new    │ ──>│ new column only │
│ Old app running │    │ columns            │    │ column           │    │ Drop old column │
└─────────────────┘    └────────────────────┘    └──────────────────┘    └─────────────────┘
```

1. **Step 1 (Expand)**: Apply migration adding the new column as `NULLABLE` or with a safe `DEFAULT`. Old application code continues functioning uninterrupted.
2. **Step 2 (Dual Write)**: Deploy new application code that writes to both columns and reads with fallback to the old column.
3. **Step 3 (Backfill)**: Run an asynchronous background script backfilling legacy records into the new schema structure.
4. **Step 4 (Contract)**: Deploy final application code reading exclusively from the new column, followed by a migration that applies `NOT NULL` constraints and drops the obsolete column.

---

## 5. Recovery from Failed Migrations

If a migration fails mid-execution (e.g. due to constraint violations on existing dirty data):
1. Review the failure in PostgreSQL logs and `prisma migrate status`.
2. Fix the underlying data discrepancy or migration SQL.
3. If the migration was partially rolled back, mark it resolved:
   ```bash
   # Mark the migration as rolled back so it can be re-executed
   npx prisma migrate resolve --rolled-back "20261025000000_add_reporting_and_job_models"
   
   # Or mark as applied if resolved manually
   npx prisma migrate resolve --applied "20261025000000_add_reporting_and_job_models"
   ```

---

## 6. Production Bootstrapping & Initial Super Admin

> **Critical Rule:** Never run `prisma/seed.ts` in production. The seed script creates demo products, mock cashiers with static passwords, and fictional transactions.

### Creating Initial Administrative Account
To provision the first `SUPER_ADMIN` in a fresh production database without hardcoding credentials:
1. Provide credentials securely via environment variables:
   ```bash
   BOOTSTRAP_ADMIN_EMAIL="admin@store.example.com" \
   BOOTSTRAP_ADMIN_PASSWORD="YourStrongOneTimePassword123!" \
   npx tsx scripts/bootstrap-super-admin.ts
   ```
2. The script hashes the password with Argon2id, inserts the `SUPER_ADMIN` user record, and outputs confirmation without logging the raw password.
3. The administrator immediately logs in, changes their password, and creates organizational store branches.
