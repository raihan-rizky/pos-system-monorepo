ALTER TYPE "TransactionLifecycleAction" ADD VALUE IF NOT EXISTS 'UNVOID';
ALTER TYPE "InventoryReason" ADD VALUE IF NOT EXISTS 'TRANSACTION_RESTORE';

ALTER TABLE "pos_transaction_lifecycle_audits" ADD COLUMN "sequence" BIGSERIAL NOT NULL;
CREATE UNIQUE INDEX "pos_transaction_lifecycle_audits_sequence_key" ON "pos_transaction_lifecycle_audits"("sequence");
DROP INDEX "pos_transaction_lifecycle_audits_storeId_transactionId_action_key";
CREATE INDEX "pos_tx_lifecycle_action_seq_idx"
  ON "pos_transaction_lifecycle_audits"("storeId", "transactionId", "action", "sequence");
CREATE INDEX "pos_tx_lifecycle_seq_idx"
  ON "pos_transaction_lifecycle_audits"("storeId", "transactionId", "sequence");
