CREATE TYPE "BatchOperationType" AS ENUM ('PRODUCT_IMPORT', 'BULK_STOCK_ADJUSTMENT', 'UNDO');
CREATE TYPE "BatchOperationStatus" AS ENUM ('COMMITTED', 'UNDONE', 'UNDO_BLOCKED');
CREATE TYPE "BatchOperationItemAction" AS ENUM ('CREATE', 'UPDATE', 'SKIP', 'STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'UNDO');

CREATE TABLE "pos_batch_operations" (
  "id" TEXT NOT NULL,
  "type" "BatchOperationType" NOT NULL,
  "status" "BatchOperationStatus" NOT NULL DEFAULT 'COMMITTED',
  "storeId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "summary" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "undoneAt" TIMESTAMP(3),
  "undoneBy" TEXT,
  "undoOfBatchId" TEXT,
  CONSTRAINT "pos_batch_operations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_batch_operation_items" (
  "id" TEXT NOT NULL,
  "batchOperationId" TEXT NOT NULL,
  "productId" TEXT,
  "sku" TEXT NOT NULL,
  "action" "BatchOperationItemAction" NOT NULL,
  "beforeSnapshot" JSONB,
  "afterSnapshot" JSONB,
  "inventoryLogId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_batch_operation_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_batch_operations_storeId_idx" ON "pos_batch_operations"("storeId");
CREATE INDEX "pos_batch_operations_createdAt_idx" ON "pos_batch_operations"("createdAt");
CREATE INDEX "pos_batch_operation_items_batchOperationId_idx" ON "pos_batch_operation_items"("batchOperationId");
CREATE INDEX "pos_batch_operation_items_productId_idx" ON "pos_batch_operation_items"("productId");
CREATE INDEX "pos_batch_operation_items_productId_createdAt_idx" ON "pos_batch_operation_items"("productId", "createdAt");

ALTER TABLE "pos_batch_operations"
  ADD CONSTRAINT "pos_batch_operations_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_batch_operations"
  ADD CONSTRAINT "pos_batch_operations_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "pos_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_batch_operations"
  ADD CONSTRAINT "pos_batch_operations_undoneBy_fkey"
  FOREIGN KEY ("undoneBy") REFERENCES "pos_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_batch_operations"
  ADD CONSTRAINT "pos_batch_operations_undoOfBatchId_fkey"
  FOREIGN KEY ("undoOfBatchId") REFERENCES "pos_batch_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_batch_operation_items"
  ADD CONSTRAINT "pos_batch_operation_items_batchOperationId_fkey"
  FOREIGN KEY ("batchOperationId") REFERENCES "pos_batch_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_batch_operation_items"
  ADD CONSTRAINT "pos_batch_operation_items_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "pos_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
