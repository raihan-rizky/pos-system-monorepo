ALTER TABLE "pos_batch_operation_items"
  ADD COLUMN IF NOT EXISTS "sourceRowNumber" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "pos_batch_operation_items_batchOperationId_sourceRowNumber_key"
  ON "pos_batch_operation_items"("batchOperationId", "sourceRowNumber");
