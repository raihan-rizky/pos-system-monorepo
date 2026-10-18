ALTER TYPE "CategoryCustomerPricingMode" ADD VALUE IF NOT EXISTS 'UNIT_COST_PLUS_PERCENT_DISCOUNT';

ALTER TABLE "pos_category_customer_pricing_rules"
  ADD COLUMN "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0;

ALTER TABLE "pos_transaction_items"
  ADD COLUMN "pricingDiscountPercent" DECIMAL(5,2);
