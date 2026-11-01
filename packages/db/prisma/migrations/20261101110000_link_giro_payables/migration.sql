ALTER TABLE "pos_supplier_payables"
  ADD COLUMN "goodsPurchaseId" TEXT,
  ADD COLUMN "giroHistoryVerifiedAt" TIMESTAMPTZ(6);

CREATE UNIQUE INDEX "pos_supplier_payables_goodsPurchaseId_key"
  ON "pos_supplier_payables"("goodsPurchaseId");

ALTER TABLE "pos_supplier_payables"
  ADD CONSTRAINT "pos_supplier_payables_goodsPurchaseId_fkey"
  FOREIGN KEY ("goodsPurchaseId") REFERENCES "pos_goods_purchases"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- The due date can precede goods receipt for an overdue giro. Manual debts
-- continue to require a due date on or after the recorded debt date.
ALTER TABLE "pos_supplier_payables"
  DROP CONSTRAINT "pos_supplier_payables_due_date_check",
  ADD CONSTRAINT "pos_supplier_payables_due_date_check"
  CHECK ("goodsPurchaseId" IS NOT NULL OR "dueDate" IS NULL OR "dueDate" >= "debtDate");

ALTER TABLE "pos_supplier_payable_payments"
  ADD COLUMN "requestScope" TEXT;

CREATE UNIQUE INDEX "pos_supplier_payable_payments_requestScope_key"
  ON "pos_supplier_payable_payments"("requestScope");
