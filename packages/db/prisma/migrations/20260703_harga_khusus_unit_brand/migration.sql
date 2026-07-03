CREATE TABLE "pos_brands" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pos_brands_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_brands_storeId_normalizedName_key"
  ON "pos_brands"("storeId", "normalizedName");

CREATE INDEX "pos_brands_storeId_idx"
  ON "pos_brands"("storeId");

ALTER TABLE "pos_brands"
  ADD CONSTRAINT "pos_brands_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_products"
  ADD COLUMN "brandId" TEXT;

CREATE INDEX "pos_products_brandId_idx"
  ON "pos_products"("brandId");

ALTER TABLE "pos_products"
  ADD CONSTRAINT "pos_products_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "pos_brands"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_category_customer_pricing_rules"
  ALTER COLUMN "customerType" DROP NOT NULL,
  ADD COLUMN "unit" TEXT,
  ADD COLUMN "brandId" TEXT;

CREATE INDEX "pos_category_customer_pricing_rules_brandId_idx"
  ON "pos_category_customer_pricing_rules"("brandId");

CREATE INDEX "pos_category_customer_pricing_rules_scope_idx"
  ON "pos_category_customer_pricing_rules"("storeId", "customerType", "categoryId", "unit", "brandId");

ALTER TABLE "pos_category_customer_pricing_rules"
  ADD CONSTRAINT "pos_category_customer_pricing_rules_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "pos_brands"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_transaction_items"
  ADD COLUMN "pricingUnit" TEXT,
  ADD COLUMN "pricingBrandId" TEXT,
  ADD COLUMN "pricingBrandName" TEXT;
