BEGIN;
-- statement-break
CREATE TABLE "pos_managed_proof_cleanup_control" (
  "singleton" BOOLEAN PRIMARY KEY DEFAULT true CONSTRAINT "managed_proof_control_singleton" CHECK ("singleton"),
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "managed_proof_cleanup_disabled" CHECK ("enabled" = false)
);
-- statement-break
INSERT INTO "pos_managed_proof_cleanup_control" ("singleton") VALUES (true);
-- statement-break
CREATE TABLE "pos_managed_proof_objects" (
  "id" TEXT PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "accountId" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL CONSTRAINT "managed_proof_key_format" CHECK ("objectKey" ~ '^managed-proofs/v1/[0-9a-f]{32}[.]webp$'),
  "state" TEXT NOT NULL CONSTRAINT "managed_proof_state_valid" CHECK ("state" IN ('uploading', 'active', 'deleting', 'deleted')),
  "attempts" INTEGER NOT NULL DEFAULT 0 CONSTRAINT "managed_proof_attempts_nonnegative" CHECK ("attempts" >= 0),
  "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "leaseId" TEXT,
  "leaseUntil" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deletedAt" TIMESTAMPTZ,
  CONSTRAINT "pos_managed_proof_objects_accountId_bucket_objectKey_key" UNIQUE ("accountId", "bucket", "objectKey"),
  CONSTRAINT "managed_proof_lease_pair" CHECK (("leaseId" IS NULL) = ("leaseUntil" IS NULL))
);
-- statement-break
CREATE INDEX "pos_managed_proof_cleanup_pending_idx"
  ON "pos_managed_proof_objects" ("state", "nextAttemptAt", "leaseUntil");
-- statement-break
CREATE FUNCTION "preserve_managed_proof_identity"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Managed proof identities must be retained';
  END IF;
  IF (OLD."id", OLD."storeId", OLD."accountId", OLD."bucket", OLD."objectKey")
     IS DISTINCT FROM (NEW."id", NEW."storeId", NEW."accountId", NEW."bucket", NEW."objectKey") THEN
    RAISE EXCEPTION 'Managed proof identity is immutable';
  END IF;
  IF OLD."state" <> NEW."state" AND NOT (
    (OLD."state" = 'uploading' AND NEW."state" = 'active') OR
    (OLD."state" = 'active' AND NEW."state" = 'deleting') OR
    (OLD."state" = 'deleting' AND NEW."state" = 'deleted')
  ) THEN
    RAISE EXCEPTION 'Invalid managed proof state transition';
  END IF;
  IF OLD."state" = 'active' AND NEW."state" = 'deleting' THEN
    IF current_setting('transaction_isolation') <> 'read committed' THEN
      RAISE EXCEPTION 'Managed proof deletion requires read committed isolation';
    END IF;
    IF EXISTS (SELECT 1 FROM "pos_managed_proof_references" WHERE "objectId" = OLD."id") THEN
      RAISE EXCEPTION 'Managed proof still has references';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
-- statement-break
CREATE TRIGGER "preserve_managed_proof_identity"
  BEFORE UPDATE OR DELETE ON "pos_managed_proof_objects"
  FOR EACH ROW EXECUTE FUNCTION "preserve_managed_proof_identity"();
-- statement-break
CREATE TABLE "pos_managed_proof_references" (
  "objectId" TEXT NOT NULL REFERENCES "pos_managed_proof_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "slot" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("objectId", "sourceType", "sourceId", "slot")
);
-- statement-break
CREATE FUNCTION "lock_active_managed_proof_reference"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  object_state TEXT;
BEGIN
  SELECT "state" INTO object_state FROM "pos_managed_proof_objects" WHERE "id" = NEW."objectId" FOR UPDATE;
  IF object_state IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'Managed proof is not active';
  END IF;
  RETURN NEW;
END;
$$;
-- statement-break
CREATE TRIGGER "managed_proof_reference_active"
  BEFORE INSERT OR UPDATE OF "objectId" ON "pos_managed_proof_references"
  FOR EACH ROW EXECUTE FUNCTION "lock_active_managed_proof_reference"();
-- statement-break
ALTER TABLE "pos_managed_proof_cleanup_control" ENABLE ROW LEVEL SECURITY;
-- statement-break
ALTER TABLE "pos_managed_proof_objects" ENABLE ROW LEVEL SECURITY;
-- statement-break
ALTER TABLE "pos_managed_proof_references" ENABLE ROW LEVEL SECURITY;
-- statement-break
REVOKE ALL ON TABLE "pos_managed_proof_cleanup_control", "pos_managed_proof_objects", "pos_managed_proof_references" FROM PUBLIC;
-- statement-break
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE "pos_managed_proof_cleanup_control", "pos_managed_proof_objects", "pos_managed_proof_references" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE "pos_managed_proof_cleanup_control", "pos_managed_proof_objects", "pos_managed_proof_references" FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    REVOKE ALL ON TABLE "pos_managed_proof_cleanup_control", "pos_managed_proof_objects", "pos_managed_proof_references" FROM service_role;
  END IF;
END;
$$;
-- statement-break
COMMIT;
