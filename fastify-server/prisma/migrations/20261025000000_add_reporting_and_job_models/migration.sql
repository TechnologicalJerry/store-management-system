-- ==============================================================================
-- Store Management System - Migration: 20261025000000_add_reporting_and_job_models
-- Stage 8: Reporting, Redis Caching, and Background Jobs
-- Engine: PostgreSQL 17+
-- ==============================================================================

-- CreateEnum: ReportType
CREATE TYPE "ReportType" AS ENUM (
    'SALES_SUMMARY',
    'TOP_PRODUCTS',
    'PAYMENT_SUMMARY',
    'INVENTORY_SUMMARY',
    'LOW_STOCK',
    'PROCUREMENT_SUMMARY'
);

-- CreateEnum: ReportStatus
CREATE TYPE "ReportStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'COMPLETED',
    'FAILED'
);

-- CreateEnum: OutboxStatus
CREATE TYPE "OutboxStatus" AS ENUM (
    'PENDING',
    'PROCESSED',
    'FAILED'
);

-- Safe Sequence for Human-Readable Report Identifiers
CREATE SEQUENCE IF NOT EXISTS "report_req_num_seq" START WITH 1000 INCREMENT BY 1;

-- CreateTable: report_requests
CREATE TABLE "report_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "report_number" VARCHAR(50) NOT NULL,
    "report_type" "ReportType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "store_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "parameters" JSONB NOT NULL,
    "result_data" JSONB,
    "error_message" VARCHAR(500),
    "expires_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_report_requests_store" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "fk_report_requests_user" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Indexes for report_requests
CREATE UNIQUE INDEX "idx_report_requests_number" ON "report_requests"("report_number");
CREATE INDEX "idx_report_requests_store_id" ON "report_requests"("store_id");
CREATE INDEX "idx_report_requests_status" ON "report_requests"("status");
CREATE INDEX "idx_report_requests_type" ON "report_requests"("report_type");
CREATE INDEX "idx_report_requests_created_at" ON "report_requests"("created_at");

-- CreateTable: outbox_events
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_type" VARCHAR(100) NOT NULL,
    "aggregate_type" VARCHAR(100) NOT NULL,
    "aggregate_id" VARCHAR(100) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" VARCHAR(500),
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- Indexes for outbox_events
CREATE INDEX "idx_outbox_events_status_created" ON "outbox_events"("status", "created_at");
CREATE INDEX "idx_outbox_events_aggregate" ON "outbox_events"("aggregate_type", "aggregate_id");
