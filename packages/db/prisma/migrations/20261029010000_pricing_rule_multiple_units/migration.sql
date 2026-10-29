ALTER TABLE "pos_category_customer_pricing_rules"
ADD COLUMN "units" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "pos_category_customer_pricing_rules"
SET "units" = ARRAY[LOWER(BTRIM("unit"))]
WHERE "unit" IS NOT NULL AND BTRIM("unit") <> '';
