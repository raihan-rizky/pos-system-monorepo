CREATE TABLE "pos_transaction_receipt_changes" (
  "id" TEXT NOT NULL,
  "sequence" BIGSERIAL NOT NULL,
  "storeId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "invoiceNumber" TEXT,
  "actorId" TEXT,
  "actorName" TEXT NOT NULL,
  "before" JSONB NOT NULL,
  "after" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_transaction_receipt_changes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_transaction_receipt_changes_sequence_key"
  ON "pos_transaction_receipt_changes"("sequence");

CREATE INDEX "pos_receipt_changes_store_transaction_seq_idx"
  ON "pos_transaction_receipt_changes"("storeId", "transactionId", "sequence");

CREATE INDEX "pos_transaction_receipt_changes_storeId_createdAt_idx"
  ON "pos_transaction_receipt_changes"("storeId", "createdAt");

-- Receipt snapshots are available only through authenticated server routes.
ALTER TABLE "pos_transaction_receipt_changes" ENABLE ROW LEVEL SECURITY;
