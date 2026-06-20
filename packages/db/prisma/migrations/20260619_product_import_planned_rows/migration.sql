CREATE TABLE IF NOT EXISTS "pos_product_import_planned_rows" (
  "id" TEXT NOT NULL,
  "batchOperationId" TEXT NOT NULL,
  "sourceRowNumber" INTEGER NOT NULL,
  "cursorIndex" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "sku" TEXT NOT NULL,
  "productId" TEXT,
  "commitAction" TEXT NOT NULL,
  "rowData" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pos_product_import_planned_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pos_product_import_planned_rows_batchOperationId_sourceRowNumber_key"
  ON "pos_product_import_planned_rows"("batchOperationId", "sourceRowNumber");

CREATE INDEX IF NOT EXISTS "pos_product_import_planned_rows_batchOperationId_cursorIndex_idx"
  ON "pos_product_import_planned_rows"("batchOperationId", "cursorIndex");

CREATE INDEX IF NOT EXISTS "pos_product_import_planned_rows_batchOperationId_status_idx"
  ON "pos_product_import_planned_rows"("batchOperationId", "status");

ALTER TABLE "pos_product_import_planned_rows"
  ADD CONSTRAINT "pos_product_import_planned_rows_batchOperationId_fkey"
  FOREIGN KEY ("batchOperationId") REFERENCES "pos_batch_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
