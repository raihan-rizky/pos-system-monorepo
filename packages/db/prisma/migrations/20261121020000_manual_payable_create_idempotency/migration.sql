CREATE TABLE "pos_manual_payable_requests" (
  "scope" TEXT NOT NULL PRIMARY KEY,
  "fingerprint" TEXT NOT NULL,
  "payableId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "pos_users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "pos_supplier_payable_payments"
  ADD COLUMN "requestPayableId" TEXT,
  ADD COLUMN "requestAmount" DECIMAL(12,2),
  ADD COLUMN "requestPaidAt" DATE,
  ADD COLUMN "requestResource" TEXT;
UPDATE "pos_supplier_payable_payments"
  SET "requestPayableId" = "payableId", "requestAmount" = "amount", "requestPaidAt" = "paidAt"
  WHERE "requestScope" IS NOT NULL;
CREATE INDEX "pos_manual_payable_requests_storeId_userId_idx" ON "pos_manual_payable_requests"("storeId", "userId");

CREATE TABLE "pos_manual_payable_attempts" (
  "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "pos_users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "version" TEXT NOT NULL,
  "key" TEXT,
  "body" TEXT,
  "completedAt" TIMESTAMP(3),
  PRIMARY KEY ("storeId", "userId"),
  CONSTRAINT "pos_manual_payable_attempt_active_check" CHECK (
    ("key" IS NULL AND "body" IS NULL AND "completedAt" IS NULL)
    OR ("key" IS NOT NULL AND "body" IS NOT NULL)
  )
);
ALTER TABLE "pos_manual_payable_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_manual_payable_requests" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pos_manual_payable_attempts" FROM PUBLIC;
REVOKE ALL ON TABLE "pos_manual_payable_requests" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE "pos_manual_payable_attempts", "pos_manual_payable_requests" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "pos_manual_payable_attempts", "pos_manual_payable_requests" FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN REVOKE ALL ON TABLE "pos_manual_payable_attempts", "pos_manual_payable_requests" FROM service_role; END IF;
END $$;
