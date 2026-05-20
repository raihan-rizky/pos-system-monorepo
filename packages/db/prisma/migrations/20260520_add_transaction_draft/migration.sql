-- Add DRAFT value to TransactionStatus enum
ALTER TYPE "TransactionStatus" ADD VALUE IF NOT EXISTS 'DRAFT';

-- Make invoiceNumber nullable so DRAFT rows can defer minting until approval
ALTER TABLE "pos_transactions" ALTER COLUMN "invoiceNumber" DROP NOT NULL;

-- Add draftNumber column (nullable, unique). Permanent reference even after approval.
ALTER TABLE "pos_transactions" ADD COLUMN "draftNumber" TEXT;

-- Unique constraint matches Prisma's @unique on a nullable column
CREATE UNIQUE INDEX "pos_transactions_draftNumber_key" ON "pos_transactions"("draftNumber");

-- Secondary index for fast counter queries (LIKE 'DRAFT-YYYYMMDD-%')
CREATE INDEX "pos_transactions_draftNumber_idx" ON "pos_transactions"("draftNumber");
