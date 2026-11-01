BEGIN;

-- Preserve both original ledgers and every payment before merging. The
-- canonical giro payable survives; the manual payable ID remains an audit key.
CREATE TABLE "pos_supplier_payable_manual_links" (
  "manualPayableId" TEXT PRIMARY KEY,
  "giroPayableId" TEXT NOT NULL REFERENCES "pos_supplier_payables"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "storeId" TEXT NOT NULL,
  "goodsPurchaseId" TEXT NOT NULL,
  "linkedById" TEXT NOT NULL,
  "linkedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "manualPayable" JSONB NOT NULL,
  "giroPayable" JSONB NOT NULL,
  "manualPayments" JSONB NOT NULL,
  "giroPayments" JSONB NOT NULL,
  "duplicatePayments" JSONB NOT NULL,
  "requestPayload" JSONB NOT NULL,
  "matchingPaymentsConfirmedDistinct" BOOLEAN NOT NULL
);
CREATE INDEX "pos_supplier_payable_manual_links_giroPayableId_idx" ON "pos_supplier_payable_manual_links"("giroPayableId");

ALTER TABLE "pos_supplier_payable_manual_links" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pos_supplier_payable_manual_links" FROM PUBLIC;
DO $$
DECLARE api_role TEXT;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL ON TABLE "pos_supplier_payable_manual_links" FROM %I', api_role);
  END LOOP;
END;
$$;

COMMIT;
