ALTER TABLE "pos_inventory_logs"
  ADD COLUMN "sourceTransactionRef" TEXT,
  ADD COLUMN "stockGroupIdSnapshot" TEXT,
  ADD COLUMN "unitMultiplierSnapshot" DOUBLE PRECISION,
  ADD COLUMN "stockBaseDelta" DOUBLE PRECISION;

ALTER TABLE "pos_production_activity_logs"
  ALTER COLUMN "transactionId" DROP NOT NULL;

ALTER TABLE "pos_production_activity_logs"
  DROP CONSTRAINT "pos_production_activity_logs_transactionId_fkey",
  ADD CONSTRAINT "pos_production_activity_logs_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "pos_transactions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "pos_inventory_logs_sourceTransactionRef_createdAt_idx"
  ON "pos_inventory_logs"("sourceTransactionRef", "createdAt");

CREATE TYPE "TransactionLifecycleAction" AS ENUM ('VOID', 'DELETE');

CREATE TABLE "pos_transaction_lifecycle_audits" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "invoiceNumber" TEXT,
  "action" "TransactionLifecycleAction" NOT NULL,
  "previousStatus" "TransactionStatus" NOT NULL,
  "actorId" TEXT,
  "actorName" TEXT NOT NULL,
  "actorRole" "Role" NOT NULL,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_transaction_lifecycle_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_transaction_lifecycle_audits_storeId_transactionId_action_key"
  ON "pos_transaction_lifecycle_audits"("storeId", "transactionId", "action");

CREATE INDEX "pos_transaction_lifecycle_audits_storeId_createdAt_idx"
  ON "pos_transaction_lifecycle_audits"("storeId", "createdAt");

CREATE INDEX "pos_transaction_lifecycle_audits_transactionId_createdAt_idx"
  ON "pos_transaction_lifecycle_audits"("transactionId", "createdAt");

ALTER TABLE "pos_transaction_lifecycle_audits"
  ADD CONSTRAINT "pos_transaction_lifecycle_audits_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pos_transaction_lifecycle_audits_actorId_fkey"
    FOREIGN KEY ("actorId") REFERENCES "pos_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
