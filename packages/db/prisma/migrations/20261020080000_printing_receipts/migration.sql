ALTER TABLE "pos_transactions"
ADD COLUMN "transactionCategory" TEXT,
ADD COLUMN "printingSubcategory" TEXT;

ALTER TABLE "pos_transactions"
ADD CONSTRAINT "pos_transactions_category_check"
CHECK ("transactionCategory" IS NULL OR "transactionCategory" IN ('ATK', 'PERCETAKAN')),
ADD CONSTRAINT "pos_transactions_printing_subcategory_check"
CHECK ("printingSubcategory" IS NULL OR (
  "transactionCategory" IS NOT DISTINCT FROM 'PERCETAKAN'
  AND "printingSubcategory" IN ('SPANDUK', 'PERCETAKAN', 'PLAT', 'STEMPEL', 'PRINT')
));

CREATE TABLE "pos_printing_receipts" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "subcategory" TEXT NOT NULL,
  "number" VARCHAR(80) NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "document" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "transactionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pos_printing_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_printing_receipts_subcategory_check" CHECK ("subcategory" IN ('SPANDUK', 'PERCETAKAN', 'PLAT', 'STEMPEL', 'PRINT')),
  CONSTRAINT "pos_printing_receipts_revision_check" CHECK ("revision" >= 1),
  CONSTRAINT "pos_printing_receipts_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pos_printing_receipts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "pos_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pos_printing_receipts_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "pos_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "pos_printing_receipts_number_key" ON "pos_printing_receipts"("number");
CREATE UNIQUE INDEX "pos_printing_receipts_transactionId_key" ON "pos_printing_receipts"("transactionId");
CREATE INDEX "pos_printing_receipts_storeId_subcategory_updatedAt_idx" ON "pos_printing_receipts"("storeId", "subcategory", "updatedAt" DESC);
CREATE INDEX "pos_transactions_printing_category_idx" ON "pos_transactions"("storeId", "transactionCategory", "printingSubcategory", "invoiceDate" DESC);

CREATE TABLE "pos_printing_receipt_counters" (
  "key" VARCHAR(40) NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "pos_printing_receipt_counters_pkey" PRIMARY KEY ("key")
);
