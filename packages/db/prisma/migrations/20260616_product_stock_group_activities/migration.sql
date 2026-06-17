-- Add stock group activity audit table.
-- This migration is idempotent because some development databases may have
-- received the table through the earlier dynamic unit stock group migration.

CREATE TABLE IF NOT EXISTS "pos_product_stock_group_activities" (
  "id" TEXT NOT NULL,
  "stockGroupId" TEXT NOT NULL,
  "productId" TEXT,
  "type" TEXT NOT NULL,
  "note" TEXT,
  "createdBy" TEXT,
  "person" TEXT,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pos_product_stock_group_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pos_product_stock_group_activities_stockGroupId_createdAt_idx"
  ON "pos_product_stock_group_activities"("stockGroupId", "createdAt");

CREATE INDEX IF NOT EXISTS "pos_product_stock_group_activities_stockGroupId_type_createdAt_idx"
  ON "pos_product_stock_group_activities"("stockGroupId", "type", "createdAt");

CREATE INDEX IF NOT EXISTS "pos_product_stock_group_activities_productId_idx"
  ON "pos_product_stock_group_activities"("productId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pos_product_stock_group_activities_stockGroupId_fkey'
  ) THEN
    ALTER TABLE "pos_product_stock_group_activities"
      ADD CONSTRAINT "pos_product_stock_group_activities_stockGroupId_fkey"
      FOREIGN KEY ("stockGroupId") REFERENCES "pos_product_stock_groups"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'pos_product_stock_group_activities_productId_fkey'
  ) THEN
    ALTER TABLE "pos_product_stock_group_activities"
      ADD CONSTRAINT "pos_product_stock_group_activities_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "pos_products"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
