BEGIN;

-- Capture the baseline and install the triggers without missing concurrent writes.
LOCK TABLE "pos_stores", "pos_products" IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE "pos_inventory_valuation_baselines" (
  "storeId" TEXT PRIMARY KEY REFERENCES "pos_stores"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "capturedAt" TIMESTAMPTZ(6) NOT NULL,
  "value" NUMERIC(65,20) NOT NULL
);

CREATE TABLE "pos_inventory_valuation_changes" (
  "id" BIGSERIAL PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL,
  "delta" NUMERIC(65,20) NOT NULL
);
CREATE INDEX "pos_inventory_valuation_changes_storeId_occurredAt_idx"
  ON "pos_inventory_valuation_changes"("storeId", "occurredAt");

INSERT INTO "pos_inventory_valuation_baselines" ("storeId", "capturedAt", "value")
SELECT s."id", clock_timestamp(),
  COALESCE(SUM(GREATEST(p."stock"::numeric, 0) * p."price") FILTER (WHERE p."isActive"), 0)
FROM "pos_stores" s
LEFT JOIN "pos_products" p ON p."storeId" = s."id"
GROUP BY s."id";

CREATE FUNCTION initialize_inventory_valuation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO "pos_inventory_valuation_baselines" ("storeId", "capturedAt", "value")
  VALUES (NEW."id", clock_timestamp(), 0);
  RETURN NEW;
END;
$$;

CREATE TRIGGER "pos_stores_inventory_valuation"
AFTER INSERT ON "pos_stores" FOR EACH ROW EXECUTE FUNCTION initialize_inventory_valuation();

CREATE FUNCTION record_inventory_valuation_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  old_value NUMERIC := 0;
  new_value NUMERIC := 0;
  change_time TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF TG_OP <> 'INSERT' AND OLD."isActive" THEN
    old_value := GREATEST(OLD."stock"::numeric, 0) * OLD."price";
  END IF;
  IF TG_OP <> 'DELETE' AND NEW."isActive" THEN
    new_value := GREATEST(NEW."stock"::numeric, 0) * NEW."price";
  END IF;

  IF TG_OP = 'UPDATE' AND OLD."storeId" = NEW."storeId" THEN
    IF new_value <> old_value THEN
      INSERT INTO "pos_inventory_valuation_changes" ("storeId", "occurredAt", "delta")
      VALUES (NEW."storeId", change_time, new_value - old_value);
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' AND old_value <> 0 THEN
      INSERT INTO "pos_inventory_valuation_changes" ("storeId", "occurredAt", "delta")
      VALUES (OLD."storeId", change_time, -old_value);
    END IF;
    IF TG_OP <> 'DELETE' AND new_value <> 0 THEN
      INSERT INTO "pos_inventory_valuation_changes" ("storeId", "occurredAt", "delta")
      VALUES (NEW."storeId", change_time, new_value);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER "pos_products_inventory_valuation"
AFTER INSERT OR UPDATE OR DELETE ON "pos_products"
FOR EACH ROW EXECUTE FUNCTION record_inventory_valuation_change();

CREATE TABLE "pos_supplier_payables" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "supplierName" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL CHECK ("amount" > 0),
  "debtDate" DATE NOT NULL,
  "dueDate" DATE,
  "note" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_supplier_payables_due_date_check" CHECK ("dueDate" IS NULL OR "dueDate" >= "debtDate")
);
CREATE INDEX "pos_supplier_payables_storeId_debtDate_idx" ON "pos_supplier_payables"("storeId", "debtDate");

CREATE TABLE "pos_supplier_payable_payments" (
  "id" TEXT PRIMARY KEY,
  "payableId" TEXT NOT NULL REFERENCES "pos_supplier_payables"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount" DECIMAL(12,2) NOT NULL CHECK ("amount" > 0),
  "paidAt" DATE NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "pos_supplier_payable_payments_payableId_paidAt_idx" ON "pos_supplier_payable_payments"("payableId", "paidAt");

COMMIT;
