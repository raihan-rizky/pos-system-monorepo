CREATE TYPE "ManualIncomeCategory" AS ENUM ('ATK', 'CETAK', 'SPANDUK', 'PRINT', 'STEMPEL');

CREATE TABLE "pos_manual_incomes" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "recordedById" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "category" "ManualIncomeCategory" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "pos_manual_incomes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_manual_incomes_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "pos_manual_incomes_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pos_manual_incomes_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "pos_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "pos_manual_incomes_storeId_deletedAt_occurredAt_idx"
  ON "pos_manual_incomes"("storeId", "deletedAt", "occurredAt" DESC);
CREATE INDEX "pos_manual_incomes_recordedById_idx" ON "pos_manual_incomes"("recordedById");

-- Access goes through authenticated, store-scoped server routes.
ALTER TABLE "pos_manual_incomes" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "pos_expenses" ADD COLUMN "manualPurchasePaymentMethod" TEXT;
ALTER TABLE "pos_expenses" ADD CONSTRAINT "pos_expenses_manual_transfer_check" CHECK (
  "manualPurchasePaymentMethod" IS NULL OR (
    "manualPurchasePaymentMethod" = 'TRANSFER' AND "category" = 'SUPPLIES'
    AND "customCategoryId" IS NULL AND "changeAmount" = 0 AND "amount" > 0
    AND "transactionId" IS NULL AND "shoppingRequestId" IS NULL
    AND "goodsPurchaseId" IS NULL AND "backdatedPurchaseDueId" IS NULL
    AND "backdatedPurchasePaymentId" IS NULL
  )
);
