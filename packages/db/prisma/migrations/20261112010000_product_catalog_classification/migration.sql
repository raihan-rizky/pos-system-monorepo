DO $$ BEGIN
  CREATE TYPE "ProductCatalogGroup" AS ENUM ('ATK', 'PERCETAKAN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "pos_product_subcategories" (
  "id" TEXT NOT NULL,
  "group" "ProductCatalogGroup" NOT NULL,
  "name" TEXT NOT NULL,
  "legacyCategoryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_product_subcategories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pos_product_subcategories_legacyCategoryId_key"
  ON "pos_product_subcategories"("legacyCategoryId");
CREATE UNIQUE INDEX IF NOT EXISTS "pos_product_subcategories_group_name_key"
  ON "pos_product_subcategories"("group", "name");
CREATE INDEX IF NOT EXISTS "pos_product_subcategories_group_idx"
  ON "pos_product_subcategories"("group");

ALTER TABLE "pos_products" ADD COLUMN IF NOT EXISTS "catalogSubcategoryId" TEXT;
CREATE INDEX IF NOT EXISTS "pos_products_catalogSubcategoryId_idx"
  ON "pos_products"("catalogSubcategoryId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pos_product_subcategories_legacyCategoryId_fkey'
      AND conrelid = '"pos_product_subcategories"'::regclass
  ) THEN
    ALTER TABLE "pos_product_subcategories"
      ADD CONSTRAINT "pos_product_subcategories_legacyCategoryId_fkey"
      FOREIGN KEY ("legacyCategoryId") REFERENCES "pos_categories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pos_products_catalogSubcategoryId_fkey'
      AND conrelid = '"pos_products"'::regclass
  ) THEN
    ALTER TABLE "pos_products"
      ADD CONSTRAINT "pos_products_catalogSubcategoryId_fkey"
      FOREIGN KEY ("catalogSubcategoryId") REFERENCES "pos_product_subcategories"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "pos_product_subcategories" ("id", "group", "name", "legacyCategoryId")
SELECT 'catalog_legacy_' || md5("id"), 'ATK'::"ProductCatalogGroup", "name", "id"
FROM "pos_categories"
ON CONFLICT DO NOTHING;

INSERT INTO "pos_product_subcategories" ("id", "group", "name")
SELECT 'catalog_atk_cartridge', 'ATK'::"ProductCatalogGroup", 'Cartridge'
WHERE NOT EXISTS (
  SELECT 1 FROM "pos_product_subcategories"
  WHERE "group" = 'ATK'
    AND lower(btrim(regexp_replace("name", '[[:space:]]+', ' ', 'g'))) = 'cartridge'
)
ON CONFLICT DO NOTHING;

INSERT INTO "pos_product_subcategories" ("id", "group", "name") VALUES
  ('catalog_printing_print', 'PERCETAKAN', 'PRINT'),
  ('catalog_printing_stempel', 'PERCETAKAN', 'STEMPEL'),
  ('catalog_printing_plat', 'PERCETAKAN', 'PLAT')
ON CONFLICT DO NOTHING;

-- Catalog mutations are mediated by the application's authorized server APIs.
ALTER TABLE "pos_product_subcategories" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pos_product_subcategories" FROM PUBLIC;
DO $security$
DECLARE api_role TEXT;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL ON TABLE "pos_product_subcategories" FROM %I', api_role);
  END LOOP;
END $security$;
