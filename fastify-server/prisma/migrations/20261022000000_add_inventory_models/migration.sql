-- ==============================================================================
-- Store Management System - Migration: 20261022000000_add_inventory_models
-- Stage 5: Inventory Management
-- Engine: PostgreSQL 17+
-- ==============================================================================

-- CreateEnum: MovementType
CREATE TYPE "MovementType" AS ENUM (
    'OPENING_STOCK',
    'STOCK_RECEIVED',
    'ADJUSTMENT_INCREASE',
    'ADJUSTMENT_DECREASE',
    'SALE',
    'RETURN',
    'TRANSFER_OUT',
    'TRANSFER_IN',
    'RESERVATION_CREATED',
    'RESERVATION_RELEASED',
    'RESERVATION_FULFILLED'
);

-- CreateEnum: ReservationStatus
CREATE TYPE "ReservationStatus" AS ENUM (
    'ACTIVE',
    'RELEASED',
    'FULFILLED',
    'EXPIRED',
    'CANCELLED'
);

-- CreateEnum: TransferStatus
CREATE TYPE "TransferStatus" AS ENUM (
    'DRAFT',
    'REQUESTED',
    'APPROVED',
    'SHIPPED',
    'PARTIALLY_RECEIVED',
    'RECEIVED',
    'CANCELLED'
);

-- CreateTable: inventory_balances
CREATE TABLE "inventory_balances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity_on_hand" DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    "quantity_reserved" DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    "reorder_level" DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_inventory_balances_non_negative_on_hand" CHECK ("quantity_on_hand" >= 0),
    CONSTRAINT "chk_inventory_balances_non_negative_reserved" CHECK ("quantity_reserved" >= 0),
    CONSTRAINT "chk_inventory_balances_reserved_lte_on_hand" CHECK ("quantity_reserved" <= "quantity_on_hand"),
    CONSTRAINT "chk_inventory_balances_non_negative_reorder" CHECK ("reorder_level" >= 0)
);

-- CreateTable: inventory_movements
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "movement_type" "MovementType" NOT NULL,
    "quantity_delta" DECIMAL(12, 4) NOT NULL,
    "quantity_before" DECIMAL(12, 4) NOT NULL,
    "quantity_after" DECIMAL(12, 4) NOT NULL,
    "reference_type" VARCHAR(50),
    "reference_id" VARCHAR(100),
    "idempotency_key" VARCHAR(100),
    "reason" VARCHAR(255),
    "notes" TEXT,
    "performed_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable: stock_reservations
CREATE TABLE "stock_reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" DECIMAL(12, 4) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "reference_type" VARCHAR(50),
    "reference_id" VARCHAR(100),
    "expires_at" TIMESTAMPTZ(6),
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_reservations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_stock_reservations_positive_quantity" CHECK ("quantity" > 0)
);

-- CreateTable: inventory_transfers
CREATE TABLE "inventory_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transfer_number" VARCHAR(50) NOT NULL,
    "source_store_id" UUID NOT NULL,
    "destination_store_id" UUID NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "created_by_user_id" UUID,
    "approved_by_user_id" UUID,
    "shipped_by_user_id" UUID,
    "received_by_user_id" UUID,
    "shipped_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transfers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_inventory_transfers_distinct_stores" CHECK ("source_store_id" <> "destination_store_id")
);

-- CreateTable: inventory_transfer_items
CREATE TABLE "inventory_transfer_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "transfer_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity_requested" DECIMAL(12, 4) NOT NULL,
    "quantity_shipped" DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    "quantity_received" DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    "notes" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transfer_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_transfer_items_positive_requested" CHECK ("quantity_requested" > 0),
    CONSTRAINT "chk_transfer_items_non_negative_shipped" CHECK ("quantity_shipped" >= 0),
    CONSTRAINT "chk_transfer_items_non_negative_received" CHECK ("quantity_received" >= 0)
);

-- Constraints & Unique Indexes
ALTER TABLE "inventory_balances" ADD CONSTRAINT "uq_inventory_balances_store_variant" UNIQUE ("store_id", "variant_id");
CREATE INDEX "idx_inventory_balances_store_id" ON "inventory_balances"("store_id");
CREATE INDEX "idx_inventory_balances_variant_id" ON "inventory_balances"("variant_id");

CREATE INDEX "idx_inventory_movements_store_variant" ON "inventory_movements"("store_id", "variant_id");
CREATE INDEX "idx_inventory_movements_type" ON "inventory_movements"("movement_type");
CREATE INDEX "idx_inventory_movements_reference" ON "inventory_movements"("reference_type", "reference_id");
CREATE INDEX "idx_inventory_movements_idempotency" ON "inventory_movements"("idempotency_key");
CREATE INDEX "idx_inventory_movements_created_at" ON "inventory_movements"("created_at");

CREATE INDEX "idx_reservations_store_variant" ON "stock_reservations"("store_id", "variant_id");
CREATE INDEX "idx_reservations_status" ON "stock_reservations"("status");
CREATE INDEX "idx_reservations_reference" ON "stock_reservations"("reference_type", "reference_id");
CREATE INDEX "idx_reservations_expires_at" ON "stock_reservations"("expires_at");

ALTER TABLE "inventory_transfers" ADD CONSTRAINT "uq_transfers_transfer_number" UNIQUE ("transfer_number");
CREATE INDEX "idx_transfers_transfer_number" ON "inventory_transfers"("transfer_number");
CREATE INDEX "idx_transfers_source_store_id" ON "inventory_transfers"("source_store_id");
CREATE INDEX "idx_transfers_dest_store_id" ON "inventory_transfers"("destination_store_id");
CREATE INDEX "idx_transfers_status" ON "inventory_transfers"("status");

ALTER TABLE "inventory_transfer_items" ADD CONSTRAINT "uq_transfer_items_transfer_variant" UNIQUE ("transfer_id", "variant_id");
CREATE INDEX "idx_transfer_items_transfer_id" ON "inventory_transfer_items"("transfer_id");
CREATE INDEX "idx_transfer_items_variant_id" ON "inventory_transfer_items"("variant_id");

-- Foreign Keys
ALTER TABLE "inventory_balances" ADD CONSTRAINT "fk_inventory_balances_store" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_balances" ADD CONSTRAINT "fk_inventory_balances_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "inventory_movements" ADD CONSTRAINT "fk_inventory_movements_store" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "fk_inventory_movements_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "fk_inventory_movements_user" FOREIGN KEY ("performed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "stock_reservations" ADD CONSTRAINT "fk_stock_reservations_store" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "fk_stock_reservations_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "fk_stock_reservations_user" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inventory_transfers" ADD CONSTRAINT "fk_transfers_source_store" FOREIGN KEY ("source_store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "fk_transfers_dest_store" FOREIGN KEY ("destination_store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "fk_transfers_created_user" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "fk_transfers_approved_user" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "fk_transfers_shipped_user" FOREIGN KEY ("shipped_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "fk_transfers_received_user" FOREIGN KEY ("received_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "inventory_transfer_items" ADD CONSTRAINT "fk_transfer_items_transfer" FOREIGN KEY ("transfer_id") REFERENCES "inventory_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inventory_transfer_items" ADD CONSTRAINT "fk_transfer_items_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
