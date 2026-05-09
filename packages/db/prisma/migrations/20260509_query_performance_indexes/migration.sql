-- Targeted indexes for the POS query patterns used by API routes.
-- Avoids changing primary-key lookups that are already index-backed.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Transaction history, dashboard date ranges, invoice sequencing, and shift cash totals.
CREATE INDEX IF NOT EXISTS "pos_transactions_store_createdAt_desc_idx"
  ON "pos_transactions"("storeId", "createdAt" DESC);

-- Status-filtered lists and aggregates, especially DP and pending approval workflows.
CREATE INDEX IF NOT EXISTS "pos_transactions_store_status_createdAt_desc_idx"
  ON "pos_transactions"("storeId", "status", "createdAt" DESC);

-- Dashboard and kanban job-order queries.
CREATE INDEX IF NOT EXISTS "pos_transactions_store_job_production_createdAt_desc_idx"
  ON "pos_transactions"("storeId", "isJobOrder", "productionStatus", "createdAt" DESC);

-- Cash drawer aggregation on shift close.
CREATE INDEX IF NOT EXISTS "pos_transactions_store_payment_createdAt_desc_idx"
  ON "pos_transactions"("storeId", "paymentMethod", "createdAt" DESC);

-- Oldest DP transaction lookup for customer debt payment.
CREATE INDEX IF NOT EXISTS "pos_transactions_customer_store_status_createdAt_idx"
  ON "pos_transactions"("customerId", "storeId", "status", "createdAt");

-- Product delete checks and dashboard top-product grouping.
CREATE INDEX IF NOT EXISTS "pos_transaction_items_productId_idx"
  ON "pos_transaction_items"("productId");

-- Product catalog browsing by store/category/name.
CREATE INDEX IF NOT EXISTS "pos_products_store_active_name_idx"
  ON "pos_products"("storeId", "isActive", "name");

CREATE INDEX IF NOT EXISTS "pos_products_store_category_active_name_idx"
  ON "pos_products"("storeId", "categoryId", "isActive", "name");

-- POS product search uses case-insensitive contains on these text columns.
CREATE INDEX IF NOT EXISTS "pos_products_name_trgm_idx"
  ON "pos_products" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "pos_products_sku_trgm_idx"
  ON "pos_products" USING GIN ("sku" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "pos_products_barcode_trgm_idx"
  ON "pos_products" USING GIN ("barcode" gin_trgm_ops);

-- Customer lists and duplicate phone checks are scoped by store.
CREATE INDEX IF NOT EXISTS "pos_customers_store_lastVisitAt_desc_idx"
  ON "pos_customers"("storeId", "lastVisitAt" DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS "pos_customers_store_type_lastVisitAt_desc_idx"
  ON "pos_customers"("storeId", "type", "lastVisitAt" DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS "pos_customers_store_phone_idx"
  ON "pos_customers"("storeId", "phone");

-- Customer search uses case-insensitive contains.
CREATE INDEX IF NOT EXISTS "pos_customers_name_trgm_idx"
  ON "pos_customers" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "pos_customers_phone_trgm_idx"
  ON "pos_customers" USING GIN ("phone" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "pos_customers_company_trgm_idx"
  ON "pos_customers" USING GIN ("company" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "pos_customers_email_trgm_idx"
  ON "pos_customers" USING GIN ("email" gin_trgm_ops);

-- Shift active lookup and paginated history.
CREATE INDEX IF NOT EXISTS "pos_cashier_shifts_store_status_openedAt_desc_idx"
  ON "pos_cashier_shifts"("storeId", "status", "openedAt" DESC);

CREATE INDEX IF NOT EXISTS "pos_cashier_shifts_store_openedAt_desc_idx"
  ON "pos_cashier_shifts"("storeId", "openedAt" DESC);

-- Salesperson picker/list by store and active flag.
CREATE INDEX IF NOT EXISTS "pos_salespersons_store_active_name_idx"
  ON "pos_salespersons"("storeId", "isActive", "name");
