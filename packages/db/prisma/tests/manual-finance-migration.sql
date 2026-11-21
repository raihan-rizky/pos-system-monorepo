\set ON_ERROR_STOP on
BEGIN;
SELECT 'manual_finance_test_' || replace(gen_random_uuid()::text, '-', '') AS test_schema \gset
SELECT format('CREATE SCHEMA %I', :'test_schema') \gexec
SELECT format('SET LOCAL search_path TO %I, pg_catalog', :'test_schema') \gexec

CREATE TYPE "Role" AS ENUM ('ADMIN', 'CASHIER', 'SALES', 'INVENTORY');
CREATE TABLE "pos_role_permissions" (
  "id" TEXT PRIMARY KEY, "role" "Role" NOT NULL, "scope" TEXT NOT NULL, "target" TEXT NOT NULL,
  "action" TEXT NOT NULL, "allowed" BOOLEAN NOT NULL, "updatedAt" TIMESTAMP NOT NULL,
  UNIQUE ("role", "scope", "target", "action")
);
CREATE TABLE "pos_stores" ("id" TEXT PRIMARY KEY);
CREATE TABLE "pos_users" ("id" TEXT PRIMARY KEY);
CREATE TABLE "pos_customer_receivables" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "amount" NUMERIC(12,2) NOT NULL);
CREATE TABLE "pos_customer_receivable_payments" ("id" TEXT PRIMARY KEY, "receivableId" TEXT NOT NULL REFERENCES "pos_customer_receivables"("id"), "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE "pos_supplier_payables" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "amount" NUMERIC(12,2) NOT NULL, "goodsPurchaseId" TEXT, UNIQUE ("id", "storeId"));
CREATE TABLE "pos_supplier_payable_payments" ("id" TEXT PRIMARY KEY, "payableId" TEXT NOT NULL REFERENCES "pos_supplier_payables"("id"), "amount" NUMERIC(12,2) NOT NULL, "paidAt" DATE NOT NULL, UNIQUE ("id", "payableId"));
CREATE TABLE "pos_expenses" ("id" TEXT PRIMARY KEY, "storeId" TEXT NOT NULL, "amount" NUMERIC(12,2) NOT NULL, UNIQUE ("id", "storeId"));

INSERT INTO "pos_role_permissions" VALUES ('existing', 'ADMIN', 'resource', 'expense.payable.manual', 'update', true, CURRENT_TIMESTAMP);
INSERT INTO "pos_customer_receivables" VALUES ('old-receivable', 'store-a', 100);
INSERT INTO "pos_customer_receivable_payments" ("id", "receivableId") VALUES ('old-receipt', 'old-receivable');
INSERT INTO "pos_supplier_payables" VALUES ('old-payable', 'store-a', 100, NULL), ('other-payable', 'store-b', 100, NULL);
INSERT INTO "pos_supplier_payable_payments" VALUES ('old-payment', 'old-payable', 25, '2026-11-01'), ('other-payment', 'other-payable', 25, '2026-11-01');
INSERT INTO "pos_expenses" VALUES ('old-transfer', 'store-a', 25), ('other-transfer', 'store-b', 25);

-- APPLY_MIGRATION_HERE

DO $$
BEGIN
  IF (SELECT "reportCategory" IS NOT NULL OR "amount" <> 100 FROM "pos_customer_receivables" WHERE "id" = 'old-receivable')
    OR (SELECT "paidAt" IS NOT NULL FROM "pos_customer_receivable_payments" WHERE "id" = 'old-receipt')
    OR (SELECT "reportCategory" IS NOT NULL OR "amount" <> 100 FROM "pos_supplier_payables" WHERE "id" = 'old-payable')
    OR (SELECT "origin" <> 'MANUAL' OR "automaticKey" IS NOT NULL OR "amount" <> 25 FROM "pos_supplier_payable_payments" WHERE "id" = 'old-payment')
    OR (SELECT "reportCategory" IS NOT NULL OR "amount" <> 25 FROM "pos_expenses" WHERE "id" = 'old-transfer') THEN
    RAISE EXCEPTION 'Legacy data changed during migration';
  END IF;
  IF (SELECT COUNT(*) FROM "pos_role_permissions") <> 96
    OR NOT (SELECT "allowed" FROM "pos_role_permissions" WHERE "id" = 'existing')
    OR (SELECT COUNT(*) FROM "pos_role_permissions" WHERE "allowed") <> 1 THEN
    RAISE EXCEPTION 'Default permissions are incorrect or an existing grant was overwritten';
  END IF;
END $$;

INSERT INTO "pos_manual_transfer_allocations" ("id", "storeId", "expenseId", "payableId", "paymentId", "amount", "createdById")
VALUES ('valid', 'store-a', 'old-transfer', 'old-payable', 'old-payment', 25, 'owner');

DO $$
BEGIN
  BEGIN
    INSERT INTO "pos_manual_transfer_allocations" ("id", "storeId", "expenseId", "payableId", "paymentId", "amount", "createdById")
    VALUES ('duplicate', 'store-a', 'old-transfer', 'old-payable', 'old-payment', 1, 'owner');
    RAISE EXCEPTION 'Duplicate payment allocation was accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO "pos_manual_transfer_allocations" ("id", "storeId", "expenseId", "payableId", "paymentId", "amount", "createdById")
    VALUES ('cross-store', 'store-a', 'old-transfer', 'other-payable', 'other-payment', 1, 'owner');
    RAISE EXCEPTION 'Cross-store allocation was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO "pos_manual_transfer_allocations" ("id", "storeId", "expenseId", "payableId", "paymentId", "amount", "createdById")
    VALUES ('wrong-payment', 'store-a', 'old-transfer', 'old-payable', 'other-payment', 1, 'owner');
    RAISE EXCEPTION 'A payment for another payable was accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  BEGIN
    INSERT INTO "pos_manual_transfer_allocations" ("id", "storeId", "expenseId", "payableId", "paymentId", "amount", "createdById")
    VALUES ('zero', 'store-b', 'other-transfer', 'other-payable', 'other-payment', 0, 'owner');
    RAISE EXCEPTION 'Zero allocation was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "origin")
    VALUES ('auto-without-key', 'old-payable', 1, '2026-11-01', 'AUTO');
    RAISE EXCEPTION 'An automatic payment without an idempotency key was accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "origin", "automaticKey")
  VALUES ('automatic', 'old-payable', 1, '2026-11-01', 'AUTO', 'due:old-payable');
  BEGIN
    INSERT INTO "pos_supplier_payable_payments" ("id", "payableId", "amount", "paidAt", "origin", "automaticKey")
    VALUES ('automatic-repeat', 'old-payable', 1, '2026-11-01', 'AUTO', 'due:old-payable');
    RAISE EXCEPTION 'Duplicate automatic settlement was accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

ROLLBACK;
