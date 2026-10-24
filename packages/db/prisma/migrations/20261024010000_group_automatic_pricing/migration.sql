-- NULL means legacy AUTO pending initialization. No product money is rewritten here.
ALTER TABLE "pos_product_stock_groups" ADD COLUMN "pricingConfig" JSONB;
