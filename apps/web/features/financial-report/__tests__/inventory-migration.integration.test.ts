import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

// Opt in only against a disposable development database. The script creates
// an isolated schema inside one transaction and always ends with ROLLBACK.
describe.skipIf(process.env.FINANCE_INVENTORY_DB_TEST !== "1")("inventory migration in PostgreSQL", () => {
  it("records stock, price, activation, deletion, and store changes without counting negative stock", () => {
    const root = path.resolve(process.cwd(), "../..");
    const schemaPath = path.join(root, "packages/db/prisma/schema.prisma");
    const migrationPath = path.join(root, "packages/db/prisma/migrations/20261031010000_financial_inventory_and_payables/migration.sql");
    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toMatch(/^\s*BEGIN;/i);
    expect(migration).toMatch(/COMMIT;\s*$/i);
    const body = migration.replace(/^\s*BEGIN;\s*/i, "").replace(/\s*COMMIT;\s*$/i, "");
    const isolated = `finance_inventory_test_${randomUUID().replaceAll("-", "")}`;
    const sql = `
BEGIN;
CREATE SCHEMA "${isolated}";
SET LOCAL search_path TO "${isolated}";
CREATE TABLE "pos_stores" ("id" TEXT PRIMARY KEY);
CREATE TABLE "pos_products" (
  "id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id"),
  "stock" DOUBLE PRECISION NOT NULL, "price" NUMERIC(12,2) NOT NULL, "isActive" BOOLEAN NOT NULL
);
INSERT INTO "pos_stores" VALUES ('s1'), ('s2');
INSERT INTO "pos_products" VALUES
  ('p1', 's1', 2, 10, true), ('p2', 's1', -3, 50, true), ('p3', 's1', 5, 20, false);
${body}
DO $check$
BEGIN
  IF (SELECT "value" FROM "pos_inventory_valuation_baselines" WHERE "storeId" = 's1') <> 20 THEN
    RAISE EXCEPTION 'baseline counted inactive or negative stock';
  END IF;
END
$check$;
UPDATE "pos_products" SET "stock" = -1 WHERE "id" = 'p1';
UPDATE "pos_products" SET "stock" = -5 WHERE "id" = 'p2';
UPDATE "pos_products" SET "stock" = 3 WHERE "id" = 'p2';
UPDATE "pos_products" SET "isActive" = true WHERE "id" = 'p3';
UPDATE "pos_products" SET "storeId" = 's2' WHERE "id" = 'p3';
UPDATE "pos_products" SET "price" = 25 WHERE "id" = 'p3';
DELETE FROM "pos_products" WHERE "id" = 'p2';
INSERT INTO "pos_stores" VALUES ('s3');
INSERT INTO "pos_products" VALUES ('p4', 's3', 5, 4, true);
DO $check$
BEGIN
  IF (SELECT "value" FROM "pos_inventory_valuation_baselines" WHERE "storeId" = 's1') +
     (SELECT COALESCE(SUM("delta"), 0) FROM "pos_inventory_valuation_changes" WHERE "storeId" = 's1') <> 0 THEN
    RAISE EXCEPTION 'incorrect s1 valuation';
  END IF;
  IF (SELECT SUM("delta") FROM "pos_inventory_valuation_changes" WHERE "storeId" = 's2') <> 125 THEN
    RAISE EXCEPTION 'incorrect store transfer or price update';
  END IF;
  IF (SELECT "value" FROM "pos_inventory_valuation_baselines" WHERE "storeId" = 's3') <> 0 OR
     (SELECT SUM("delta") FROM "pos_inventory_valuation_changes" WHERE "storeId" = 's3') <> 20 THEN
    RAISE EXCEPTION 'incorrect new store valuation';
  END IF;
  BEGIN
    INSERT INTO "pos_supplier_payables" ("id","storeId","supplierName","amount","debtDate","createdById")
    VALUES ('invalid','s1','supplier',-1,'2026-10-01','user');
    RAISE EXCEPTION 'negative debt was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$check$;
ROLLBACK;
`;
    const requireFromDb = createRequire(path.join(root, "packages/db/package.json"));
    const prisma = requireFromDb.resolve("prisma/build/index.js");
    const result = spawnSync(process.execPath, [prisma, "db", "execute", "--stdin", "--schema", schemaPath], {
      input: sql, encoding: "utf8", env: process.env, timeout: 60_000,
    });
    expect(result.error?.message ?? result.stderr).toBeFalsy();
    expect(result.status).toBe(0);
  }, 75_000);
});
