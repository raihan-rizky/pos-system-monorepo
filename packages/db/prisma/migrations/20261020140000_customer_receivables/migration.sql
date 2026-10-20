CREATE TABLE "pos_customer_receivables" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "debtDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "clientMutationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "pos_customer_receivables_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_customer_receivables_amount_check" CHECK ("amount" > 0 AND "amountPaid" >= 0 AND "amountPaid" <= "amount"),
    CONSTRAINT "pos_customer_receivables_dates_check" CHECK ("dueDate" >= "debtDate")
);

CREATE TABLE "pos_customer_receivable_payments" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "clientMutationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pos_customer_receivable_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pos_customer_receivable_payments_amount_check" CHECK ("amount" > 0),
    CONSTRAINT "pos_customer_receivable_payments_method_check" CHECK ("method" IN ('CASH', 'DEBIT', 'CREDIT', 'QRIS', 'TRANSFER'))
);

CREATE UNIQUE INDEX "pos_customer_receivables_clientMutationId_key" ON "pos_customer_receivables"("clientMutationId");
CREATE UNIQUE INDEX "pos_customer_receivable_payments_clientMutationId_key" ON "pos_customer_receivable_payments"("clientMutationId");
CREATE INDEX "pos_customer_receivables_storeId_customerId_debtDate_idx" ON "pos_customer_receivables"("storeId", "customerId", "debtDate");
CREATE INDEX "pos_customer_receivables_storeId_dueDate_id_idx" ON "pos_customer_receivables"("storeId", "dueDate", "id");
CREATE INDEX "pos_customer_receivable_payments_receivableId_createdAt_idx" ON "pos_customer_receivable_payments"("receivableId", "createdAt");
ALTER TABLE "pos_customer_receivables" ADD CONSTRAINT "pos_customer_receivables_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_customer_receivables" ADD CONSTRAINT "pos_customer_receivables_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "pos_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_customer_receivable_payments" ADD CONSTRAINT "pos_customer_receivable_payments_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "pos_customer_receivables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
