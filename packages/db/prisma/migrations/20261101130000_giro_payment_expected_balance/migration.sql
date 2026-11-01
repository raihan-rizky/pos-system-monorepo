-- Persist the balance observed by the client so idempotent retries can verify
-- every financial field. Existing requests remain NULL for legacy retries.
ALTER TABLE "pos_supplier_payable_payments"
  ADD COLUMN "requestExpectedBalance" DECIMAL(12,2);
