const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const path = require('node:path');

const migration = path.join(__dirname, '../prisma/migrations/20261112010000_daily_income_comparison/migration.sql');
const databaseUrl = process.env.POS_COMPARISON_TEST_URL;

test('the comparison migration isolates amounts and applies cashier defaults only once', { skip: !databaseUrl }, () => {
  assert.ok(existsSync(migration), 'the daily comparison migration must exist');
  const url = new URL(databaseUrl);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname), 'use only an isolated local PostgreSQL test server');
  const schema = `comparison_test_${randomBytes(6).toString('hex')}`;
  const sql = readFileSync(migration, 'utf8');
  const baseline = `
    BEGIN;
    CREATE SCHEMA "${schema}";
    SET LOCAL search_path TO "${schema}";
    CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'CASHIER', 'SALES', 'INVENTORY');
    CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'DEBIT', 'CREDIT', 'QRIS', 'TRANSFER', 'TEMPO');
    CREATE TABLE "pos_stores" ("id" TEXT PRIMARY KEY);
    CREATE TABLE "pos_users" ("id" TEXT PRIMARY KEY);
    CREATE TABLE "pos_role_permissions" (
      "id" TEXT PRIMARY KEY, "role" "Role" NOT NULL, "scope" TEXT NOT NULL,
      "target" TEXT NOT NULL, "action" TEXT NOT NULL, "allowed" BOOLEAN NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      UNIQUE ("role", "scope", "target", "action")
    );
    INSERT INTO "pos_role_permissions" VALUES
      ('old-page','CASHIER','page','/financial-report','access',false,now()),
      ('old-total','CASHIER','resource','financial-report.daily-income','read',false,now()),
      ('old-method','CASHIER','resource','financial-report.daily-payment-method','read',false,now()),
      ('old-category','CASHIER','resource','financial-report.daily-category','read',false,now()),
      ('old-admin','ADMIN','resource','transaction','update',true,now());
  `;
  const checks = `
    DO $check$ BEGIN
      IF (SELECT count(*) FROM "pos_role_permissions" WHERE "role"='CASHIER' AND "allowed" AND (("scope"='page' AND "target"='/financial-report' AND "action"='access') OR ("scope"='resource' AND "target" IN ('financial-report.daily-income','financial-report.daily-payment-method') AND "action"='read'))) <> 3 THEN RAISE EXCEPTION 'cashier prerequisites missing'; END IF;
      IF (SELECT count(*) FROM "pos_role_permissions" WHERE "role"='CASHIER' AND "target"='financial-report.daily-comparison' AND "allowed" AND "action" IN ('read','create','update')) <> 3 THEN RAISE EXCEPTION 'cashier comparison grants missing'; END IF;
      IF EXISTS (SELECT 1 FROM "pos_role_permissions" WHERE "role" IN ('ADMIN','SALES','INVENTORY') AND "target"='financial-report.daily-comparison' AND "allowed") THEN RAISE EXCEPTION 'unexpected comparison grant'; END IF;
      IF (SELECT "allowed" FROM "pos_role_permissions" WHERE "id"='old-category') OR NOT (SELECT "allowed" FROM "pos_role_permissions" WHERE "id"='old-admin') THEN RAISE EXCEPTION 'unrelated grant changed'; END IF;
      IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='"pos_daily_income_comparisons"'::regclass) OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='"pos_daily_income_comparison_amounts"'::regclass) THEN RAISE EXCEPTION 'RLS missing'; END IF;
    END $check$;
    INSERT INTO "pos_stores" VALUES ('store-a'),('store-b');
    INSERT INTO "pos_users" VALUES ('user-a');
    INSERT INTO "pos_daily_income_comparisons" ("id","storeId","date","savedById","savedByName","posSnapshot","updatedAt") VALUES ('comparison-a','store-a','2026-11-08','user-a','Contoh','[]',now());
    INSERT INTO "pos_daily_income_comparison_amounts" ("id","comparisonId","method","amount") VALUES ('amount-a','comparison-a','CASH',0);
    DO $check$ BEGIN
      BEGIN INSERT INTO "pos_daily_income_comparisons" ("id","storeId","date","savedByName","posSnapshot","updatedAt") VALUES ('duplicate','store-a','2026-11-08','Contoh','[]',now()); RAISE EXCEPTION 'duplicate day accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
      BEGIN INSERT INTO "pos_daily_income_comparison_amounts" VALUES ('duplicate-method','comparison-a','CASH',10); RAISE EXCEPTION 'duplicate method accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
      BEGIN INSERT INTO "pos_daily_income_comparison_amounts" VALUES ('negative','comparison-a','TRANSFER',-1); RAISE EXCEPTION 'negative accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
      BEGIN INSERT INTO "pos_daily_income_comparison_amounts" VALUES ('tempo','comparison-a','TEMPO',1); RAISE EXCEPTION 'tempo accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
    END $check$;
    UPDATE "pos_role_permissions" SET "allowed"=false WHERE "role"='CASHIER' AND (("target"='financial-report.daily-comparison' AND "action"='update') OR ("target"='/financial-report' AND "action"='access'));
  `;
  const recheck = `
    DO $check$ BEGIN
      IF EXISTS (SELECT 1 FROM "pos_role_permissions" WHERE "role"='CASHIER' AND "allowed" AND (("target"='financial-report.daily-comparison' AND "action"='update') OR ("target"='/financial-report' AND "action"='access'))) THEN RAISE EXCEPTION 'reapplying changed an owner decision'; END IF;
      IF (SELECT count(*) FROM "pos_daily_income_comparison_amounts") <> 1 THEN RAISE EXCEPTION 'saved amounts changed'; END IF;
    END $check$;
    ROLLBACK;
  `;
  execFileSync(process.env.PSQL || 'psql', ['-X', '--set', 'ON_ERROR_STOP=1', '--dbname', databaseUrl], { input: baseline + sql + checks + sql + recheck, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
});
