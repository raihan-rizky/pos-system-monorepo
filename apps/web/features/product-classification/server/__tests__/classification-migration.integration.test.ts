import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const url = process.env.PRODUCT_CLASSIFICATION_TEST_DATABASE_URL;
const psql = process.env.PRODUCT_CLASSIFICATION_TEST_PSQL ?? "psql";

// Only a disposable local database is allowed. Every object is created inside
// a transaction, which PostgreSQL also rolls back if the connection is lost.
describe.skipIf(!url)("product classification migrations in PostgreSQL", () => {
  it("preserves legacy products, seeds the catalog, and enforces its relations", () => {
    const target = new URL(url!);
    if (target.hostname !== "127.0.0.1" || target.pathname !== "/pos_catalog_migration_test") {
      throw new Error("Classification migration tests require the dedicated local database.");
    }
    const root = path.resolve(process.cwd(), "../..");
    const migration = (name: string) => readFileSync(path.join(root, "packages/db/prisma/migrations", name, "migration.sql"), "utf8");
    const catalog = migration("20261112010000_product_catalog_classification");
    const pricing = migration("20261113010000_subcategory_customer_pricing");
    const printing = migration("20261117010000_add_printing_subcategories");
    const schema = `catalog_test_${randomUUID().replaceAll("-", "")}`;
    const sql = `
BEGIN;
SET LOCAL client_min_messages = warning;
CREATE SCHEMA "${schema}";
SET LOCAL search_path TO "${schema}";
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN; END IF;
END $roles$;
ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
CREATE TYPE "CustomerType" AS ENUM ('UMUM');
CREATE TYPE "CategoryCustomerPricingMode" AS ENUM ('FIXED');
CREATE TABLE "pos_categories" ("id" TEXT PRIMARY KEY, "name" TEXT UNIQUE NOT NULL);
CREATE TABLE "pos_products" ("id" TEXT PRIMARY KEY, "categoryId" TEXT NOT NULL REFERENCES "pos_categories"("id"));
CREATE TABLE "pos_stores" ("id" TEXT PRIMARY KEY);
CREATE TABLE "pos_brands" ("id" TEXT PRIMARY KEY);
CREATE TABLE "pos_users" ("id" TEXT PRIMARY KEY);
INSERT INTO "pos_categories" VALUES ('a', 'ATK'), ('b', 'BOT'), ('p', 'PLANO'), ('c', '  cartridge  ');
INSERT INTO "pos_products" VALUES ('product-a', 'a'), ('product-b', 'b');
INSERT INTO "pos_stores" VALUES ('store');
${catalog}
${pricing}
${printing}
${catalog}
${pricing}
${printing}
DO $check$
BEGIN
  IF (SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = '${schema}' AND c.relname IN ('pos_product_subcategories', 'pos_subcategory_customer_pricing_rules')
        AND c.relrowsecurity) <> 2 THEN
    RAISE EXCEPTION 'classification tables must enable row level security';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated'), ('service_role')) roles(name)
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) privileges(name)
    WHERE n.nspname = '${schema}' AND c.relname IN ('pos_product_subcategories', 'pos_subcategory_customer_pricing_rules')
      AND has_table_privilege(roles.name, c.oid, privileges.name)
  ) THEN
    RAISE EXCEPTION 'classification tables retain direct API role privileges';
  END IF;
  IF (SELECT COUNT(*) FROM "pos_product_subcategories" WHERE "group" = 'ATK') <> 4 THEN
    RAISE EXCEPTION 'legacy categories or normalized Cartridge were not preserved';
  END IF;
  IF (SELECT array_agg("name" ORDER BY "name") FROM "pos_product_subcategories" WHERE "group" = 'PERCETAKAN') <> ARRAY['CETAK','PLAT','PRINT','SPANDUK','STEMPEL'] THEN
    RAISE EXCEPTION 'printing subcategories differ from the approved catalog';
  END IF;
  IF (SELECT COUNT(*) FROM "pos_product_subcategories" WHERE "legacyCategoryId" IS NOT NULL) <> 4 THEN
    RAISE EXCEPTION 'legacy mappings are incomplete';
  END IF;
  IF EXISTS (SELECT 1 FROM "pos_products" WHERE "catalogSubcategoryId" IS NOT NULL) OR
     (SELECT "categoryId" FROM "pos_products" WHERE "id" = 'product-b') <> 'b' THEN
    RAISE EXCEPTION 'existing products were classified or their legacy category changed';
  END IF;
  BEGIN
    UPDATE "pos_products" SET "catalogSubcategoryId" = 'missing' WHERE "id" = 'product-a';
    RAISE EXCEPTION 'invalid product subcategory was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $check$;
UPDATE "pos_products" SET "catalogSubcategoryId" = 'catalog_printing_print' WHERE "id" = 'product-a';
INSERT INTO "pos_subcategory_customer_pricing_rules"
  ("id", "storeId", "subcategoryId", "mode", "value", "updatedAt")
  VALUES ('rule', 'store', 'catalog_printing_print', 'FIXED', 10, NOW());
DO $check$
BEGIN
  BEGIN
    DELETE FROM "pos_product_subcategories" WHERE "id" = 'catalog_printing_print';
    RAISE EXCEPTION 'subcategory referenced by a product or rule was deleted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END $check$;
ROLLBACK;
`;
    const result = spawnSync(psql, [url!, "-X", "-v", "ON_ERROR_STOP=1", "-q"], {
      input: sql,
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(result.error?.message ?? result.stderr, "migration rehearsal failed").toBe("");
    expect(result.status).toBe(0);
  }, 40_000);
});
