ALTER TABLE "pos_transactions"
  ADD COLUMN "taxRate" DECIMAL(5,2),
  ADD COLUMN "taxMethod" TEXT NOT NULL DEFAULT 'STANDARD';

ALTER TABLE "pos_transactions"
  ADD CONSTRAINT "pos_transactions_taxRate_check" CHECK ("taxRate" IS NULL OR "taxRate" BETWEEN 0 AND 100),
  ADD CONSTRAINT "pos_transactions_taxMethod_check" CHECK ("taxMethod" IN ('STANDARD', 'DPP_NILAI_LAIN'));
