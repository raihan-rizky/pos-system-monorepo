CREATE TYPE "ManualReceiptReportCategory" AS ENUM ('CETAK', 'PLAT', 'STEMPEL', 'SPANDUK', 'ATK', 'PRINT');
CREATE TYPE "ManualExpenseReportCategory" AS ENUM ('CETAK_PLAT', 'SPANDUK', 'ATK', 'SALARY');
CREATE TYPE "ManualPayablePaymentOrigin" AS ENUM ('MANUAL', 'AUTO', 'CORRECTED_AUTO');

ALTER TABLE "pos_customer_receivables" ADD COLUMN "reportCategory" "ManualReceiptReportCategory";
ALTER TABLE "pos_customer_receivable_payments" ADD COLUMN "paidAt" DATE;
ALTER TABLE "pos_supplier_payables" ADD COLUMN "reportCategory" "ManualExpenseReportCategory";
ALTER TABLE "pos_supplier_payable_payments"
  ADD COLUMN "origin" "ManualPayablePaymentOrigin" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "automaticKey" TEXT,
  ADD CONSTRAINT "pos_payable_payment_auto_key_check" CHECK (
    ("origin" = 'AUTO' AND "automaticKey" IS NOT NULL)
    OR ("origin" <> 'AUTO' AND "automaticKey" IS NULL)
  );
ALTER TABLE "pos_expenses" ADD COLUMN "reportCategory" "ManualExpenseReportCategory", ADD COLUMN "manualTransferFingerprint" TEXT,
  ADD COLUMN "manualTransferProofDeleteKey" TEXT, ADD COLUMN "manualTransferProofDeleteExpectedVersion" TIMESTAMP(3),
  ADD COLUMN "manualTransferProofDeleteVersion" TIMESTAMP(3);

CREATE UNIQUE INDEX "pos_payable_payments_id_payable_key" ON "pos_supplier_payable_payments"("id", "payableId");
CREATE UNIQUE INDEX "pos_supplier_payable_payments_automaticKey_key" ON "pos_supplier_payable_payments"("automaticKey");
CREATE UNIQUE INDEX "pos_expenses_id_store_key" ON "pos_expenses"("id", "storeId");

CREATE TABLE "pos_manual_transfer_allocations" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "expenseId" TEXT NOT NULL,
  "payableId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_manual_transfer_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_manual_transfer_alloc_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "pos_manual_transfer_alloc_expense_fkey" FOREIGN KEY ("expenseId", "storeId")
    REFERENCES "pos_expenses"("id", "storeId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "pos_manual_transfer_alloc_payable_fkey" FOREIGN KEY ("payableId", "storeId")
    REFERENCES "pos_supplier_payables"("id", "storeId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "pos_manual_transfer_alloc_payment_fkey" FOREIGN KEY ("paymentId", "payableId")
    REFERENCES "pos_supplier_payable_payments"("id", "payableId") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "pos_manual_transfer_allocations_paymentId_key" ON "pos_manual_transfer_allocations"("paymentId");
CREATE UNIQUE INDEX "pos_manual_transfer_alloc_payment_payable_key" ON "pos_manual_transfer_allocations"("paymentId", "payableId");
CREATE INDEX "pos_manual_transfer_alloc_store_expense_idx" ON "pos_manual_transfer_allocations"("storeId", "expenseId");
ALTER TABLE "pos_manual_transfer_allocations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pos_manual_transfer_allocations" FROM PUBLIC;

CREATE TABLE "pos_manual_transfer_attempts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL REFERENCES "pos_stores"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "pos_users"("id") ON DELETE CASCADE,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE INDEX "pos_manual_transfer_attempt_store_user_idx" ON "pos_manual_transfer_attempts"("storeId", "userId", "createdAt");
ALTER TABLE "pos_manual_transfer_attempts" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pos_manual_transfer_attempts" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE "pos_manual_transfer_attempts" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "pos_manual_transfer_attempts" FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN REVOKE ALL ON TABLE "pos_manual_transfer_attempts" FROM service_role; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE "pos_manual_transfer_allocations" FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE "pos_manual_transfer_allocations" FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN REVOKE ALL ON TABLE "pos_manual_transfer_allocations" FROM service_role; END IF;
END $$;

WITH roles(role) AS (
  VALUES ('ADMIN'), ('CASHIER'), ('SALES'), ('INVENTORY')
), targets(target) AS (
  VALUES ('customer.receivable.manual'), ('customer.receivable.manual.payment'),
    ('expense.payable.manual'), ('expense.payable.manual.payment'),
    ('expense.manual_transfer.edit'), ('expense.manual_transfer.allocation')
), actions(action) AS (
  VALUES ('read'), ('create'), ('update'), ('delete')
)
INSERT INTO "pos_role_permissions" ("id", "role", "scope", "target", "action", "allowed", "updatedAt")
SELECT 'manual-finance-' || lower(roles.role) || '-' || targets.target || '-' || actions.action,
  roles.role::"Role", 'resource', targets.target, actions.action, false, CURRENT_TIMESTAMP
FROM roles CROSS JOIN targets CROSS JOIN actions
ON CONFLICT ("role", "scope", "target", "action") DO NOTHING;
