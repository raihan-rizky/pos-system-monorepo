-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('SUPPLIES', 'UTILITIES', 'RENT', 'SALARY', 'TRANSPORT', 'MAINTENANCE', 'CASH_BOND', 'BEVERAGES', 'OTHER');

-- CreateTable
CREATE TABLE "pos_expenses" (
    "id" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "applicantName" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "changeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "transactionId" TEXT,
    "attachmentUrl" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "pos_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_expenses_occurredAt_idx" ON "pos_expenses"("occurredAt");

-- CreateIndex
CREATE INDEX "pos_expenses_category_idx" ON "pos_expenses"("category");

-- CreateIndex
CREATE INDEX "pos_expenses_recordedById_idx" ON "pos_expenses"("recordedById");

-- CreateIndex
CREATE INDEX "pos_expenses_deletedAt_idx" ON "pos_expenses"("deletedAt");

-- CreateIndex
CREATE INDEX "pos_expenses_transactionId_idx" ON "pos_expenses"("transactionId");

-- AddForeignKey
ALTER TABLE "pos_expenses" ADD CONSTRAINT "pos_expenses_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "pos_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_expenses" ADD CONSTRAINT "pos_expenses_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "pos_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
