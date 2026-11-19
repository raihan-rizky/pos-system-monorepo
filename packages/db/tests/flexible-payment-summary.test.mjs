import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import assert from "node:assert/strict";

const enabled = process.env.POS_PAYMENT_SUMMARY_SQL === "1";
const container = process.env.POS_TEST_POSTGRES_CONTAINER ?? "codex-shopping-flexible-test-20261119";
const migrations = new URL("../prisma/migrations/", import.meta.url);
const legacy = readFileSync(new URL("20261019110000_goods_purchase_payment/migration.sql", migrations), "utf8");
const schedule = readFileSync(new URL("20261107090000_goods_purchase_payment_schedule/migration.sql", migrations), "utf8");
const flexiblePath = fileURLToPath(new URL("20261119010000_flexible_goods_purchase_payment_summary/migration.sql", migrations));

function runSql(body) {
  assert.match(container, /^codex-shopping-[a-z0-9-]+$/, "Gunakan container PostgreSQL pengujian khusus.");
  const schema = `payment_test_${randomUUID().replaceAll("-", "")}`;
  const flexible = existsSync(flexiblePath) ? readFileSync(flexiblePath, "utf8") : "";
  const sql = `BEGIN;
    CREATE SCHEMA "${schema}";
    SET LOCAL search_path TO "${schema}";
    CREATE TABLE "pos_goods_purchases" ("id" TEXT PRIMARY KEY, "totalAmount" NUMERIC(12,2) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE "pos_inventory_inbound_receipts" ("id" TEXT PRIMARY KEY);
    ${legacy}
    ${schedule}
    ${flexible}
    ${body}
    ROLLBACK;`;
  return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-v", "ON_ERROR_STOP=1", "-U", "shopping_test", "-d", "shopping_correction_test", "-A", "-t"], { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

test("migrated PostgreSQL saves a mixed summary and preserves each scheduled amount and date", { skip: !enabled }, () => {
  const result = runSql(`
    INSERT INTO "pos_goods_purchases" ("id", "totalAmount", "paymentMethod") VALUES ('purchase', 8936156.00, 'TRANSFER');
    INSERT INTO "pos_goods_purchase_payments" ("id", "goodsPurchaseId", "method", "amount", "dueDate") VALUES
      ('transfer', 'purchase', 'TRANSFER', 4947500.00, NULL),
      ('giro', 'purchase', 'GIRO', 3868656.00, '2026-12-05');
    UPDATE "pos_goods_purchases" SET "totalAmount" = 8816156.00, "paymentMethod" = NULL, "paymentDueDate" = '2026-12-05' WHERE "id" = 'purchase';
    SELECT concat_ws('|', "totalAmount", COALESCE("paymentMethod"::text, 'MIXED'), "paymentDueDate") FROM "pos_goods_purchases";
    SELECT concat_ws('|', "method", "amount", COALESCE("dueDate"::text, 'NONE')) FROM "pos_goods_purchase_payments" ORDER BY "id";`);
  assert.match(result, /8816156\.00\|MIXED\|2026-12-05/);
  assert.match(result, /GIRO\|3868656\.00\|2026-12-05/);
  assert.match(result, /TRANSFER\|4947500\.00\|NONE/);
});

test("migrated PostgreSQL still rejects invalid single-method summaries", { skip: !enabled }, () => {
  runSql(`DO $$ BEGIN
    BEGIN
      INSERT INTO "pos_goods_purchases" ("id", "totalAmount", "paymentMethod", "paymentDueDate") VALUES ('bad-giro', 10, 'GIRO', NULL);
      RAISE EXCEPTION 'Giro without a due date was accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN
      INSERT INTO "pos_goods_purchases" ("id", "totalAmount", "paymentMethod", "paymentDueDate") VALUES ('bad-transfer', 10, 'TRANSFER', '2026-12-05');
      RAISE EXCEPTION 'Transfer with a due date was accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    INSERT INTO "pos_goods_purchases" ("id", "totalAmount", "paymentMethod", "paymentDueDate") VALUES
      ('giro', 10, 'GIRO', '2026-12-05'), ('transfer', 10, 'TRANSFER', NULL), ('unset', 0, NULL, NULL);
  END $$;`);
});

test("migrated PostgreSQL keeps scheduled-row method, date, and nonnegative amount checks", { skip: !enabled }, () => {
  runSql(`INSERT INTO "pos_goods_purchases" ("id", "totalAmount") VALUES ('purchase', 10);
    DO $$ BEGIN
      BEGIN
        INSERT INTO "pos_goods_purchase_payments" ("id", "goodsPurchaseId", "method", "amount") VALUES ('bad-giro', 'purchase', 'GIRO', 10);
        RAISE EXCEPTION 'Scheduled Giro without date was accepted';
      EXCEPTION WHEN check_violation THEN NULL; END;
      BEGIN
        INSERT INTO "pos_goods_purchase_payments" ("id", "goodsPurchaseId", "method", "amount", "dueDate") VALUES ('bad-transfer', 'purchase', 'TRANSFER', 10, '2026-12-05');
        RAISE EXCEPTION 'Scheduled Transfer with date was accepted';
      EXCEPTION WHEN check_violation THEN NULL; END;
      BEGIN
        INSERT INTO "pos_goods_purchase_payments" ("id", "goodsPurchaseId", "method", "amount") VALUES ('negative', 'purchase', 'TRANSFER', -1);
        RAISE EXCEPTION 'Negative scheduled amount was accepted';
      EXCEPTION WHEN check_violation THEN NULL; END;
    END $$;`);
});
