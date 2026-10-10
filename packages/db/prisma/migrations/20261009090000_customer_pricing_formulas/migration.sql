ALTER TYPE "CategoryCustomerPricingMode" ADD VALUE IF NOT EXISTS 'COST_PLUS_FLAT';
ALTER TYPE "CategoryCustomerPricingMode" ADD VALUE IF NOT EXISTS 'COST_PLUS_PERCENT';

ALTER TABLE "pos_category_customer_pricing_rules"
  ADD COLUMN "customerTypes" "CustomerType"[] NOT NULL DEFAULT ARRAY[]::"CustomerType"[];

UPDATE "pos_category_customer_pricing_rules"
SET "customerTypes" = ARRAY["customerType"]
WHERE "customerType" IS NOT NULL;
