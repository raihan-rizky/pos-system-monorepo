-- Offline sync metadata for idempotent transaction uploads.
-- These columns are nullable so existing transactions remain valid.

ALTER TABLE "pos_transactions"
  ADD COLUMN IF NOT EXISTS "offlineClientMutationId" TEXT,
  ADD COLUMN IF NOT EXISTS "offlineOriginalPayload" JSONB,
  ADD COLUMN IF NOT EXISTS "offlineSyncMetadata" JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS "pos_transactions_offlineClientMutationId_key"
  ON "pos_transactions"("offlineClientMutationId");

CREATE INDEX IF NOT EXISTS "pos_transactions_offlineClientMutationId_idx"
  ON "pos_transactions"("offlineClientMutationId");
