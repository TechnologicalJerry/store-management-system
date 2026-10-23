-- ==============================================================================
-- Store Management System - Migration: 20261023000000_add_procurement_models
-- Stage 6: Suppliers and Procurement
-- Engine: PostgreSQL 17+
-- ==============================================================================

-- CreateEnum: SupplierStatus
CREATE TYPE "SupplierStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'SUSPENDED'
);

-- CreateEnum: SupplierProductStatus
CREATE TYPE "SupplierProductStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE'
);

-- CreateEnum: PurchaseOrderStatus
CREATE TYPE "PurchaseOrderStatus" AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'ORDERED',
    'PARTIALLY_RECEIVED',
    'RECEIVED',
    'CANCELLED'
);

-- CreateEnum: GoodsReceiptStatus
CREATE TYPE "GoodsReceiptStatus" AS ENUM (
    'COMPLETED',
    'CANCELLED'
);

-- Safe Sequences for Human-Readable Identifiers
CREATE SEQUENCE IF NOT EXISTS "purchase_order_num_seq" START WITH 1000 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS "goods_receipt_num_seq" START WITH 1000 INCREMENT BY 1;

-- CreateTable: suppliers
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "website" VARCHAR(255),
    "tax_identifier" VARCHAR(50),
    "address_line_1" VARCHAR(255),
    "address_line_2" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "postal_code" VARCHAR(30),
    "country_code" VARCHAR(10),
    "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_suppliers_code_not_empty" CHECK (length(trim("code")) > 0)
);

-- CreateTable: supplier_products
CREATE TABLE "supplier_products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplier_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "supplier_sku" VARCHAR(100),
    "supplier_product_name" VARCHAR(200),
    "purchase_price" DECIMAL(12, 2) NOT NULL,
    "currency_code" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "minimum_order_quantity" DECIMAL(12, 4) NOT NULL DEFAULT 1.0000,
    "lead_time_days" INTEGER,
    "is_preferred" BOOLEAN NOT NULL DEFAULT false,
    "status" "SupplierProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_supplier_products_non_negative_price" CHECK ("purchase_price" >= 0),
    CONSTRAINT "chk_supplier_products_positive_moq" CHECK ("minimum_order_quantity" > 0),
    CONSTRAINT "chk_supplier_products_non_negative_lead_time" CHECK ("lead_time_days" IS NULL OR "lead_time_days" >= 0)
);

-- CreateTable: purchase_orders
CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchase_order_number" VARCHAR(50) NOT NULL,
    "supplier_id" UUID NOT NULL,
    "destination_store_id" UUID NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "currency_code" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "subtotal" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "discount_total" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "tax_total" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "shipping_total" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "grand_total" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "notes" TEXT,
    "created_by_user_id" UUID,
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "ordered_at" TIMESTAMPTZ(6),
    "expected_delivery_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_purchase_orders_non_negative_subtotal" CHECK ("subtotal" >= 0),
    CONSTRAINT "chk_purchase_orders_non_negative_discount" CHECK ("discount_total" >= 0),
    CONSTRAINT "chk_purchase_orders_non_negative_tax" CHECK ("tax_total" >= 0),
    CONSTRAINT "chk_purchase_orders_non_negative_shipping" CHECK ("shipping_total" >= 0),
    CONSTRAINT "chk_purchase_orders_non_negative_grand_total" CHECK ("grand_total" >= 0)
);

-- CreateTable: purchase_order_items
CREATE TABLE "purchase_order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchase_order_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "supplier_product_id" UUID,
    "sku_snapshot" VARCHAR(100) NOT NULL,
    "product_name_snapshot" VARCHAR(200) NOT NULL,
    "supplier_sku_snapshot" VARCHAR(100),
    "quantity_ordered" DECIMAL(12, 4) NOT NULL,
    "quantity_received" DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    "unit_price" DECIMAL(12, 2) NOT NULL,
    "discount_amount" DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    "tax_rate" DECIMAL(5, 4) NOT NULL DEFAULT 0.0000,
    "line_total" DECIMAL(12, 2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_po_items_positive_ordered_qty" CHECK ("quantity_ordered" > 0),
    CONSTRAINT "chk_po_items_non_negative_received_qty" CHECK ("quantity_received" >= 0),
    CONSTRAINT "chk_po_items_non_negative_price" CHECK ("unit_price" >= 0),
    CONSTRAINT "chk_po_items_non_negative_discount" CHECK ("discount_amount" >= 0),
    CONSTRAINT "chk_po_items_non_negative_tax" CHECK ("tax_rate" >= 0),
    CONSTRAINT "chk_po_items_non_negative_line_total" CHECK ("line_total" >= 0)
);

-- CreateTable: goods_receipts
CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receipt_number" VARCHAR(50) NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "destination_store_id" UUID NOT NULL,
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'COMPLETED',
    "received_by_user_id" UUID,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivery_reference" VARCHAR(100),
    "notes" TEXT,
    "idempotency_key" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: goods_receipt_items
CREATE TABLE "goods_receipt_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "goods_receipt_id" UUID NOT NULL,
    "purchase_order_item_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity_delivered" DECIMAL(12, 4) NOT NULL,
    "quantity_accepted" DECIMAL(12, 4) NOT NULL,
    "quantity_rejected" DECIMAL(12, 4) NOT NULL DEFAULT 0.0000,
    "rejection_reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "chk_gr_items_non_negative_delivered" CHECK ("quantity_delivered" >= 0),
    CONSTRAINT "chk_gr_items_non_negative_accepted" CHECK ("quantity_accepted" >= 0),
    CONSTRAINT "chk_gr_items_non_negative_rejected" CHECK ("quantity_rejected" >= 0),
    CONSTRAINT "chk_gr_items_sum_equals_delivered" CHECK ("quantity_accepted" + "quantity_rejected" = "quantity_delivered")
);

-- CreateTable: purchase_order_status_history
CREATE TABLE "purchase_order_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "purchase_order_id" UUID NOT NULL,
    "from_status" "PurchaseOrderStatus" NOT NULL,
    "to_status" "PurchaseOrderStatus" NOT NULL,
    "changed_by_user_id" UUID,
    "reason" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_status_history_pkey" PRIMARY KEY ("id")
);

-- Constraints & Indexes

-- Suppliers
ALTER TABLE "suppliers" ADD CONSTRAINT "uq_suppliers_code" UNIQUE ("code");
CREATE INDEX "idx_suppliers_code" ON "suppliers"("code");
CREATE INDEX "idx_suppliers_status" ON "suppliers"("status");
CREATE INDEX "idx_suppliers_name" ON "suppliers"("name");

-- Supplier Products
ALTER TABLE "supplier_products" ADD CONSTRAINT "uq_supplier_products_supplier_variant" UNIQUE ("supplier_id", "variant_id");
CREATE INDEX "idx_supplier_products_supplier_id" ON "supplier_products"("supplier_id");
CREATE INDEX "idx_supplier_products_variant_id" ON "supplier_products"("variant_id");
CREATE INDEX "idx_supplier_products_status" ON "supplier_products"("status");

-- Purchase Orders
ALTER TABLE "purchase_orders" ADD CONSTRAINT "uq_purchase_orders_number" UNIQUE ("purchase_order_number");
CREATE INDEX "idx_purchase_orders_number" ON "purchase_orders"("purchase_order_number");
CREATE INDEX "idx_purchase_orders_supplier_id" ON "purchase_orders"("supplier_id");
CREATE INDEX "idx_purchase_orders_destination_store_id" ON "purchase_orders"("destination_store_id");
CREATE INDEX "idx_purchase_orders_status" ON "purchase_orders"("status");
CREATE INDEX "idx_purchase_orders_created_at" ON "purchase_orders"("created_at");

-- Purchase Order Items
CREATE INDEX "idx_purchase_order_items_po_id" ON "purchase_order_items"("purchase_order_id");
CREATE INDEX "idx_purchase_order_items_variant_id" ON "purchase_order_items"("variant_id");

-- Goods Receipts
ALTER TABLE "goods_receipts" ADD CONSTRAINT "uq_goods_receipts_number" UNIQUE ("receipt_number");
ALTER TABLE "goods_receipts" ADD CONSTRAINT "uq_goods_receipts_idempotency_key" UNIQUE ("idempotency_key");
CREATE INDEX "idx_goods_receipts_number" ON "goods_receipts"("receipt_number");
CREATE INDEX "idx_goods_receipts_po_id" ON "goods_receipts"("purchase_order_id");
CREATE INDEX "idx_goods_receipts_store_id" ON "goods_receipts"("destination_store_id");
CREATE INDEX "idx_goods_receipts_idempotency" ON "goods_receipts"("idempotency_key");
CREATE INDEX "idx_goods_receipts_received_at" ON "goods_receipts"("received_at");

-- Goods Receipt Items
CREATE INDEX "idx_goods_receipt_items_receipt_id" ON "goods_receipt_items"("goods_receipt_id");
CREATE INDEX "idx_goods_receipt_items_po_item_id" ON "goods_receipt_items"("purchase_order_item_id");
CREATE INDEX "idx_goods_receipt_items_variant_id" ON "goods_receipt_items"("variant_id");

-- Status History
CREATE INDEX "idx_po_status_history_po_id" ON "purchase_order_status_history"("purchase_order_id");
CREATE INDEX "idx_po_status_history_created_at" ON "purchase_order_status_history"("created_at");

-- Foreign Keys
ALTER TABLE "supplier_products" ADD CONSTRAINT "fk_supplier_products_supplier" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "supplier_products" ADD CONSTRAINT "fk_supplier_products_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_orders" ADD CONSTRAINT "fk_purchase_orders_supplier" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "fk_purchase_orders_dest_store" FOREIGN KEY ("destination_store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "fk_purchase_orders_created_user" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "fk_purchase_orders_approved_user" FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "purchase_order_items" ADD CONSTRAINT "fk_po_items_purchase_order" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "fk_po_items_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "fk_po_items_supplier_product" FOREIGN KEY ("supplier_product_id") REFERENCES "supplier_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "goods_receipts" ADD CONSTRAINT "fk_goods_receipts_purchase_order" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "fk_goods_receipts_dest_store" FOREIGN KEY ("destination_store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipts" ADD CONSTRAINT "fk_goods_receipts_received_user" FOREIGN KEY ("received_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "fk_gr_items_goods_receipt" FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "fk_gr_items_po_item" FOREIGN KEY ("purchase_order_item_id") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "fk_gr_items_variant" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_status_history" ADD CONSTRAINT "fk_po_history_purchase_order" FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "purchase_order_status_history" ADD CONSTRAINT "fk_po_history_changed_user" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
