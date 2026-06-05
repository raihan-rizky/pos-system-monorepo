CREATE TABLE "pos_debt_payment_logs" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pos_debt_payment_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_debt_payment_logs_storeId_createdAt_idx"
  ON "pos_debt_payment_logs"("storeId", "createdAt");

CREATE INDEX "pos_debt_payment_logs_customerId_createdAt_idx"
  ON "pos_debt_payment_logs"("customerId", "createdAt");

CREATE INDEX "pos_debt_payment_logs_transactionId_idx"
  ON "pos_debt_payment_logs"("transactionId");

ALTER TABLE "pos_debt_payment_logs"
  ADD CONSTRAINT "pos_debt_payment_logs_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "pos_transactions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_debt_payment_logs"
  ADD CONSTRAINT "pos_debt_payment_logs_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "pos_customers"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_debt_payment_logs"
  ADD CONSTRAINT "pos_debt_payment_logs_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
