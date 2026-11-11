CREATE TABLE "pos_manual_income_payments" (
  "id" TEXT NOT NULL,
  "manualIncomeId" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "pos_manual_income_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_manual_income_payments_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "pos_manual_income_payments_method_check" CHECK ("method" IN ('CASH', 'QRIS', 'DEBIT', 'CREDIT', 'TRANSFER')),
  CONSTRAINT "pos_manual_income_payments_manualIncomeId_fkey" FOREIGN KEY ("manualIncomeId") REFERENCES "pos_manual_incomes"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "pos_manual_income_payments_manualIncomeId_method_key"
  ON "pos_manual_income_payments"("manualIncomeId", "method");

-- Access goes through authenticated, store-scoped server routes.
ALTER TABLE "pos_manual_income_payments" ENABLE ROW LEVEL SECURITY;
