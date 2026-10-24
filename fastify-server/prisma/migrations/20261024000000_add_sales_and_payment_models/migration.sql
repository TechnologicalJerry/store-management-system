-- ==============================================================================
-- Store Management System - Migration: 20261024000000_add_sales_and_payment_models
-- Stage 7: Sales and Payment Workflows
-- Engine: PostgreSQL 17+
-- ==============================================================================

-- CreateEnum: SaleStatus
CREATE TYPE "SaleStatus" AS ENUM (
    'DRAFT',
    'PENDING_PAYMENT',
    'COMPLETED',
    'CANCELLED',
    'PARTIALLY_REFUNDED',
    'REFUNDED'
);

-- CreateEnum: PaymentMethod
CREATE TYPE "PaymentMethod" AS ENUM (
    'CASH',
    'CARD',
    'EXTERNAL_DIGITAL',
    'STORE_CREDIT'
);

-- CreateEnum: PaymentStatus
CREATE TYPE "PaymentStatus" AS ENUM (
    'PENDING',
    'REQUIRES_ACTION',
    'AUTHORIZED',
    'CAPTURED',
    'FAILED',
    'CANCELLED',
    'PARTIALLY_REFUNDED',
    'REFUNDED'
);

-- CreateEnum: RefundStatus
CREATE TYPE "RefundStatus" AS ENUM (
    'PENDING',
    'SUCCEEDED',
    'FAILED',
    'CANCELLED'
);

-- Safe Sequences for Human-Readable Identifiers
CREATE SEQUENCE IF NOT EXISTS "sale_num_seq" START WITH 1000 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "payment_ref_seq" START WITH 1000 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "refund_ref_seq" START WITH 1000 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "receipt_num_seq" START WITH 1000 INCREMENT BY 1;

-- CreateTable: sales
CREATE TABLE "sales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_number" VARCHAR(50) NOT NULL,
    "store_id" UUID NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'DRAFT',
    "currency_code" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "discount_total" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "tax_total" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "grand_total" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "amount_paid" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "amount_refunded" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "cashier_user_id" UUID,
    "idempotency_key" VARCHAR(100),
    "notes" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_sales_subtotal_non_negative" CHECK ("subtotal" >= 0),
    CONSTRAINT "chk_sales_discount_total_non_negative" CHECK ("discount_total" >= 0),
    CONSTRAINT "chk_sales_tax_total_non_negative" CHECK ("tax_total" >= 0),
    CONSTRAINT "chk_sales_grand_total_non_negative" CHECK ("grand_total" >= 0),
    CONSTRAINT "chk_sales_amount_paid_non_negative" CHECK ("amount_paid" >= 0),
    CONSTRAINT "chk_sales_amount_refunded_non_negative" CHECK ("amount_refunded" >= 0),
    CONSTRAINT "chk_sales_refund_lte_paid" CHECK ("amount_refunded" <= "amount_paid")
);

-- CreateTable: sale_items
CREATE TABLE "sale_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "sku_snapshot" VARCHAR(100) NOT NULL,
    "product_name_snapshot" VARCHAR(200) NOT NULL,
    "variant_name_snapshot" VARCHAR(150),
    "quantity" DECIMAL(12, 4) NOT NULL,
    "unit_price" DECIMAL(12, 2) NOT NULL,
    "discount_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "tax_rate" DECIMAL(5, 4) NOT NULL DEFAULT 0.0000,
    "tax_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "line_total" DECIMAL(12, 2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_sale_items_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "chk_sale_items_unit_price_non_negative" CHECK ("unit_price" >= 0),
    CONSTRAINT "chk_sale_items_discount_non_negative" CHECK ("discount_amount" >= 0),
    CONSTRAINT "chk_sale_items_tax_rate_non_negative" CHECK ("tax_rate" >= 0),
    CONSTRAINT "chk_sale_items_tax_amount_non_negative" CHECK ("tax_amount" >= 0),
    CONSTRAINT "chk_sale_items_line_total_non_negative" CHECK ("line_total" >= 0)
);

-- CreateTable: payments
CREATE TABLE "payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "sale_id" UUID NOT NULL,
    "payment_reference" VARCHAR(50) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12, 2) NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "provider" VARCHAR(50) NOT NULL DEFAULT 'CASH',
    "provider_transaction_id" VARCHAR(100),
    "idempotency_key" VARCHAR(100),
    "failure_code" VARCHAR(50),
    "failure_message" VARCHAR(255),
    "initiated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authorized_at" TIMESTAMPTZ(6),
    "captured_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_payments_amount_positive" CHECK ("amount" > 0)
);

-- CreateTable: refunds
CREATE TABLE "refunds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payment_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "refund_reference" VARCHAR(50) NOT NULL,
    "amount" DECIMAL(12, 2) NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "reason" VARCHAR(255) NOT NULL,
    "provider_refund_id" VARCHAR(100),
    "idempotency_key" VARCHAR(100),
    "requested_by_user_id" UUID,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_refunds_amount_positive" CHECK ("amount" > 0)
);

-- CreateTable: receipts
CREATE TABLE "receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_number" VARCHAR(50) NOT NULL,
    "sale_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "store_name_snapshot" VARCHAR(150) NOT NULL,
    "store_address_snapshot" VARCHAR(255),
    "cashier_name_snapshot" VARCHAR(100) NOT NULL,
    "receipt_data" JSONB NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- Constraints & Unique Indexes

-- Sales
ALTER TABLE "sales" ADD CONSTRAINT "uq_sales_sale_number" UNIQUE ("sale_number");
ALTER TABLE "sales" ADD CONSTRAINT "uq_sales_idempotency_key" UNIQUE ("idempotency_key");
CREATE INDEX "idx_sales_number" ON "sales"("sale_number");
CREATE INDEX "idx_sales_store_id" ON "sales"("store_id");
CREATE INDEX "idx_sales_status" ON "sales"("status");
CREATE INDEX "idx_sales_idempotency" ON "sales"("idempotency_key");
CREATE INDEX "idx_sales_created_at" ON "sales"("created_at");

-- Sale Items
CREATE INDEX "idx_sale_items_sale_id" ON "sale_items"("sale_id");
CREATE INDEX "idx_sale_items_variant_id" ON "sale_items"("variant_id");

-- Payments
ALTER TABLE "payments" ADD CONSTRAINT "uq_payments_payment_reference" UNIQUE ("payment_reference");
ALTER TABLE "payments" ADD CONSTRAINT "uq_payments_idempotency_key" UNIQUE ("idempotency_key");
CREATE INDEX "idx_payments_reference" ON "payments"("payment_reference");
CREATE INDEX "idx_payments_sale_id" ON "payments"("sale_id");
CREATE INDEX "idx_payments_status" ON "payments"("status");
CREATE INDEX "idx_payments_idempotency" ON "payments"("idempotency_key");
CREATE INDEX "idx_payments_captured_at" ON "payments"("captured_at");

-- Refunds
ALTER TABLE "refunds" ADD CONSTRAINT "uq_refunds_refund_reference" UNIQUE ("refund_reference");
ALTER TABLE "refunds" ADD CONSTRAINT "uq_refunds_idempotency_key" UNIQUE ("idempotency_key");
CREATE INDEX "idx_refunds_reference" ON "refunds"("refund_reference");
CREATE INDEX "idx_refunds_payment_id" ON "refunds"("payment_id");
CREATE INDEX "idx_refunds_sale_id" ON "refunds"("sale_id");
CREATE INDEX "idx_refunds_status" ON "refunds"("status");
CREATE INDEX "idx_refunds_idempotency" ON "refunds"("idempotency_key");

-- Receipts
ALTER TABLE "receipts" ADD CONSTRAINT "uq_receipts_receipt_number" UNIQUE ("receipt_number");
ALTER TABLE "receipts" ADD CONSTRAINT "uq_receipts_sale_id" UNIQUE ("sale_id");
CREATE INDEX "idx_receipts_number" ON "receipts"("receipt_number");
CREATE INDEX "idx_receipts_sale_id" ON "receipts"("sale_id");
CREATE INDEX "idx_receipts_store_id" ON "receipts"("store_id");
CREATE INDEX "idx_receipts_issued_at" ON "receipts"("issued_at");

-- Foreign Keys

-- Sales
ALTER TABLE "sales" ADD CONSTRAINT "fk_sales_store" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sales" ADD CONSTRAINT "fk_sales_cashier_user" FOREIGN KEY ("cashier_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sale Items
ALTER TABLE "sale_items" ADD CONSTRAINT "fk_sale_items_sale" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sale_items" ADD CONSTRAINT "fk_sale_items_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Payments
ALTER TABLE "payments" ADD CONSTRAINT "fk_payments_sale" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Refunds
ALTER TABLE "refunds" ADD CONSTRAINT "fk_refunds_payment" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "fk_refunds_sale" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "fk_refunds_requested_user" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Receipts
ALTER TABLE "receipts" ADD CONSTRAINT "fk_receipts_sale" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "fk_receipts_store" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
