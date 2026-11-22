ALTER TABLE "pos_supplier_payables" ADD COLUMN "ledgerVersion" BIGINT NOT NULL DEFAULT 0;
-- statement-break
ALTER TABLE "pos_supplier_payable_payments" ADD COLUMN "requestLedgerVersion" TEXT;
-- statement-break
CREATE FUNCTION "advance_payable_ledger_version"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW."ledgerVersion" := OLD."ledgerVersion" + 1;
  RETURN NEW;
END;
$$;
-- statement-break
CREATE TRIGGER "payable_ledger_version_on_update"
BEFORE UPDATE ON "pos_supplier_payables"
FOR EACH ROW EXECUTE FUNCTION "advance_payable_ledger_version"();
-- statement-break
CREATE FUNCTION "advance_related_payable_ledger_version"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  affected_ids TEXT[];
  payable_id TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    affected_ids := ARRAY[NEW."payableId"];
  ELSIF TG_OP = 'DELETE' THEN
    affected_ids := ARRAY[OLD."payableId"];
  ELSE
    affected_ids := ARRAY[OLD."payableId", NEW."payableId"];
  END IF;

  FOR payable_id IN
    SELECT "id" FROM "pos_supplier_payables"
    WHERE "id" = ANY(affected_ids) ORDER BY "id" FOR UPDATE
  LOOP
    UPDATE "pos_supplier_payables" SET "ledgerVersion" = "ledgerVersion" WHERE "id" = payable_id;
  END LOOP;
  RETURN NULL;
END;
$$;
-- statement-break
CREATE TRIGGER "payable_ledger_version_on_payment"
AFTER INSERT OR UPDATE OR DELETE ON "pos_supplier_payable_payments"
FOR EACH ROW EXECUTE FUNCTION "advance_related_payable_ledger_version"();
-- statement-break
CREATE TRIGGER "payable_ledger_version_on_allocation"
AFTER INSERT OR UPDATE OR DELETE ON "pos_manual_transfer_allocations"
FOR EACH ROW EXECUTE FUNCTION "advance_related_payable_ledger_version"();
-- statement-break
CREATE FUNCTION "require_payable_request_version"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."requestScope" IS NOT NULL AND NEW."requestLedgerVersion" IS NULL THEN
    RAISE EXCEPTION 'A keyed payable payment requires a ledger version' USING ERRCODE = '23514';
  END IF;
  IF NEW."requestScope" IS NULL AND current_setting('pos.payable_system_payment', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'An unkeyed payable payment requires an authorized system transaction' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
-- statement-break
CREATE TRIGGER "payable_require_request_version"
BEFORE INSERT ON "pos_supplier_payable_payments"
FOR EACH ROW EXECUTE FUNCTION "require_payable_request_version"();
-- statement-break
CREATE TABLE "pos_payable_payment_attempts" (
  "scope" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "payableId" TEXT NOT NULL,
  "resource" TEXT NOT NULL CHECK ("resource" IN ('MANUAL', 'GIRO')),
  "version" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "cancelled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- statement-break
ALTER TABLE "pos_payable_payment_attempts" ENABLE ROW LEVEL SECURITY;
-- statement-break
REVOKE ALL ON TABLE "pos_payable_payment_attempts" FROM PUBLIC;
-- statement-break
DO $$
DECLARE role_name text;
BEGIN
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL ON TABLE "pos_payable_payment_attempts" FROM %I', role_name);
  END LOOP;
END;
$$;
-- statement-break
CREATE OR REPLACE FUNCTION "require_payable_request_version"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  attempt_cancelled boolean;
  attempt_user text;
  attempt_payable text;
  attempt_version text;
BEGIN
  IF NEW."requestScope" IS NOT NULL THEN
    IF NEW."requestLedgerVersion" IS NULL THEN
      RAISE EXCEPTION 'A keyed payable payment requires a ledger version' USING ERRCODE = '23514';
    END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."requestScope", 0));
    SELECT "cancelled", "userId", "payableId", "version" INTO attempt_cancelled, attempt_user, attempt_payable, attempt_version
    FROM "pos_payable_payment_attempts" WHERE "scope" = NEW."requestScope";
    IF FOUND AND (attempt_cancelled OR attempt_user <> NEW."createdById" OR attempt_payable <> NEW."payableId" OR attempt_version <> NEW."requestLedgerVersion") THEN
      RAISE EXCEPTION 'The payable payment attempt is cancelled or does not match' USING ERRCODE = '23514';
    END IF;
  ELSIF current_setting('pos.payable_system_payment', true) IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'An unkeyed payable payment requires an authorized system transaction' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
