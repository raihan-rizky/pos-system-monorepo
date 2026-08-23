CREATE TYPE "TransactionStockDeductionSource" AS ENUM ('TRANSACTION', 'SURAT_JALAN');

ALTER TABLE "pos_transactions"
ADD COLUMN "stockDeductionSource" "TransactionStockDeductionSource";

UPDATE "pos_transactions" SET "stockDeductionSource" = 'SURAT_JALAN';

ALTER TABLE "pos_transactions"
ALTER COLUMN "stockDeductionSource" SET DEFAULT 'TRANSACTION',
ALTER COLUMN "stockDeductionSource" SET NOT NULL;
