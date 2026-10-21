-- ==============================================================================
-- Store Management System - Migration: 20261021000000_add_store_and_catalog_models
-- Stage 4: Store Management, User Administration, and Product Catalog
-- Engine: PostgreSQL 17+
-- ==============================================================================

-- CreateEnum: StoreStatus
CREATE TYPE "StoreStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum: MembershipStatus
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum: CategoryStatus
CREATE TYPE "CategoryStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum: ProductStatus
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum: VariantStatus
CREATE TYPE "VariantStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DISCONTINUED');

-- CreateTable: stores
CREATE TABLE "stores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(150) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" VARCHAR(500),
    "email" VARCHAR(255),
    "phone" VARCHAR(50),
    "address_line_1" VARCHAR(255),
    "address_line_2" VARCHAR(255),
    "city" VARCHAR(100),
    "state" VARCHAR(100),
    "postal_code" VARCHAR(30),
    "country_code" VARCHAR(10),
    "timezone" VARCHAR(50) NOT NULL DEFAULT 'UTC',
    "status" "StoreStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable: store_memberships
CREATE TABLE "store_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "store_id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable: product_categories
CREATE TABLE "product_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "parent_id" UUID,
    "status" "CategoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable: products
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(220) NOT NULL,
    "description" TEXT,
    "category_id" UUID NOT NULL,
    "brand" VARCHAR(100),
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable: product_variants
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "sku" VARCHAR(100) NOT NULL,
    "barcode" VARCHAR(100),
    "price" DECIMAL(12,2) NOT NULL,
    "cost_price" DECIMAL(12,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "tax_category" VARCHAR(50) NOT NULL DEFAULT 'STANDARD',
    "attributes" JSONB,
    "status" "VariantStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- Unique Constraints
ALTER TABLE "stores" ADD CONSTRAINT "stores_code_key" UNIQUE ("code");
ALTER TABLE "store_memberships" ADD CONSTRAINT "uq_store_memberships_user_store" UNIQUE ("user_id", "store_id");
ALTER TABLE "product_categories" ADD CONSTRAINT "product_categories_slug_key" UNIQUE ("slug");
ALTER TABLE "products" ADD CONSTRAINT "products_slug_key" UNIQUE ("slug");
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_sku_key" UNIQUE ("sku");
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_barcode_key" UNIQUE ("barcode");

-- Performance Indexes
CREATE INDEX "idx_stores_code" ON "stores"("code");
CREATE INDEX "idx_stores_status" ON "stores"("status");

CREATE INDEX "idx_store_memberships_user_id" ON "store_memberships"("user_id");
CREATE INDEX "idx_store_memberships_store_id" ON "store_memberships"("store_id");
CREATE INDEX "idx_store_memberships_status" ON "store_memberships"("status");

CREATE INDEX "idx_categories_slug" ON "product_categories"("slug");
CREATE INDEX "idx_categories_parent_id" ON "product_categories"("parent_id");
CREATE INDEX "idx_categories_status" ON "product_categories"("status");

CREATE INDEX "idx_products_slug" ON "products"("slug");
CREATE INDEX "idx_products_category_id" ON "products"("category_id");
CREATE INDEX "idx_products_status" ON "products"("status");
CREATE INDEX "idx_products_brand" ON "products"("brand");

CREATE INDEX "idx_product_variants_product_id" ON "product_variants"("product_id");
CREATE INDEX "idx_product_variants_sku" ON "product_variants"("sku");
CREATE INDEX "idx_product_variants_barcode" ON "product_variants"("barcode");
CREATE INDEX "idx_product_variants_status" ON "product_variants"("status");

-- Foreign Keys
ALTER TABLE "store_memberships" ADD CONSTRAINT "fk_store_memberships_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "store_memberships" ADD CONSTRAINT "fk_store_memberships_store" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "store_memberships" ADD CONSTRAINT "fk_store_memberships_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "product_categories" ADD CONSTRAINT "fk_product_categories_parent" FOREIGN KEY ("parent_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "products" ADD CONSTRAINT "fk_products_category" FOREIGN KEY ("category_id") REFERENCES "product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "product_variants" ADD CONSTRAINT "fk_product_variants_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
