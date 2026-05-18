ALTER TABLE "pos_products"
  ALTER COLUMN "stock" TYPE DOUBLE PRECISION USING "stock"::double precision,
  ALTER COLUMN "stock" SET DEFAULT 0;

ALTER TABLE "pos_inventory_logs"
  ALTER COLUMN "quantity" TYPE DOUBLE PRECISION USING "quantity"::double precision;
