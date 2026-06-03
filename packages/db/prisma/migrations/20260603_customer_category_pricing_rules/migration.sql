CREATE TYPE "CategoryCustomerPricingMode" AS ENUM ('FLAT_DISCOUNT', 'PERCENT_DISCOUNT');

ALTER TABLE "pos_transaction_items"
  ADD COLUMN "pricingRuleId" TEXT,
  ADD COLUMN "pricingCustomerType" "CustomerType",
  ADD COLUMN "pricingCategoryId" TEXT,
  ADD COLUMN "pricingCategoryName" TEXT,
  ADD COLUMN "pricingMode" "CategoryCustomerPricingMode",
  ADD COLUMN "pricingValue" DECIMAL(12, 2),
  ADD COLUMN "originalUnitPrice" DECIMAL(12, 2),
  ADD COLUMN "appliedUnitPrice" DECIMAL(12, 2);

CREATE TABLE "pos_category_customer_pricing_rules" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "customerType" "CustomerType" NOT NULL,
  "mode" "CategoryCustomerPricingMode" NOT NULL,
  "value" DECIMAL(12, 2) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pos_category_customer_pricing_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_transaction_items_pricingRuleId_idx"
  ON "pos_transaction_items"("pricingRuleId");

CREATE INDEX "pos_category_customer_pricing_rules_storeId_isActive_idx"
  ON "pos_category_customer_pricing_rules"("storeId", "isActive");

CREATE INDEX "pos_category_customer_pricing_rules_storeId_customerType_categoryId_idx"
  ON "pos_category_customer_pricing_rules"("storeId", "customerType", "categoryId");

CREATE INDEX "pos_category_customer_pricing_rules_categoryId_idx"
  ON "pos_category_customer_pricing_rules"("categoryId");

ALTER TABLE "pos_category_customer_pricing_rules"
  ADD CONSTRAINT "pos_category_customer_pricing_rules_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_category_customer_pricing_rules"
  ADD CONSTRAINT "pos_category_customer_pricing_rules_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "pos_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_category_customer_pricing_rules"
  ADD CONSTRAINT "pos_category_customer_pricing_rules_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "pos_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_category_customer_pricing_rules"
  ADD CONSTRAINT "pos_category_customer_pricing_rules_updatedBy_fkey"
  FOREIGN KEY ("updatedBy") REFERENCES "pos_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
