ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'INVENTORY';

CREATE TYPE "InventoryLogVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'MISMATCH');
CREATE TYPE "InventoryTaskType" AS ENUM ('WEEKLY_CLEANING_PROOF', 'DAILY_STOCK_MATCHING');
CREATE TYPE "InventoryTaskPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "InventoryTaskStatus" AS ENUM ('PENDING', 'SUBMITTED');
CREATE TYPE "InventoryInboundReceiptStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'NEEDS_REVISION', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "InventoryInboundReceiptLineStatus" AS ENUM ('RECEIVED', 'PARTIAL', 'MISSING', 'DAMAGED', 'MISMATCH', 'OVER_RECEIVED');

CREATE TABLE "pos_inventory_log_verifications" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "inventoryLogId" TEXT NOT NULL,
  "status" "InventoryLogVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "note" TEXT,
  "verifiedBy" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pos_inventory_log_verifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_inventory_tasks" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "type" "InventoryTaskType" NOT NULL,
  "periodType" "InventoryTaskPeriod" NOT NULL,
  "periodKey" TEXT NOT NULL,
  "status" "InventoryTaskStatus" NOT NULL DEFAULT 'PENDING',
  "proofUrl" TEXT,
  "resolvedProofImageUrl" TEXT,
  "note" TEXT,
  "submittedBy" TEXT,
  "submittedAt" TIMESTAMP(3),
  "completionSnapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pos_inventory_tasks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_inventory_inbound_receipts" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "shoppingRequestId" TEXT,
  "supplierId" TEXT,
  "status" "InventoryInboundReceiptStatus" NOT NULL DEFAULT 'DRAFT',
  "note" TEXT,
  "submittedBy" TEXT,
  "submittedAt" TIMESTAMP(3),
  "approvedBy" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "revisionReason" TEXT,
  "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pos_inventory_inbound_receipts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_inventory_inbound_receipt_lines" (
  "id" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "shoppingRequestItemId" TEXT,
  "status" "InventoryInboundReceiptLineStatus" NOT NULL,
  "expectedQuantity" DOUBLE PRECISION NOT NULL,
  "receivedQuantity" DOUBLE PRECISION NOT NULL,
  "productNameSnapshot" TEXT NOT NULL,
  "skuSnapshot" TEXT NOT NULL,
  "unitSnapshot" TEXT,
  "costPriceSnapshot" DECIMAL(12,2),
  "costPriceApplied" DECIMAL(12,2),
  "expectedQuantitySnapshot" DOUBLE PRECISION NOT NULL,
  "receivedQuantitySnapshot" DOUBLE PRECISION NOT NULL,
  "supplierNameSnapshot" TEXT,
  "invoiceNumberSnapshot" TEXT,
  "note" TEXT,
  "inventoryLogId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pos_inventory_inbound_receipt_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_inventory_log_verifications_inventoryLogId_key"
  ON "pos_inventory_log_verifications"("inventoryLogId");
CREATE INDEX "pos_inventory_log_verifications_storeId_status_updatedAt_idx"
  ON "pos_inventory_log_verifications"("storeId", "status", "updatedAt");
CREATE INDEX "pos_inventory_log_verifications_verifiedBy_verifiedAt_idx"
  ON "pos_inventory_log_verifications"("verifiedBy", "verifiedAt");

CREATE UNIQUE INDEX "pos_inventory_tasks_storeId_type_periodKey_key"
  ON "pos_inventory_tasks"("storeId", "type", "periodKey");
CREATE INDEX "pos_inventory_tasks_storeId_type_status_idx"
  ON "pos_inventory_tasks"("storeId", "type", "status");
CREATE INDEX "pos_inventory_tasks_submittedBy_submittedAt_idx"
  ON "pos_inventory_tasks"("submittedBy", "submittedAt");

CREATE INDEX "pos_inventory_inbound_receipts_storeId_status_createdAt_idx"
  ON "pos_inventory_inbound_receipts"("storeId", "status", "createdAt");
CREATE INDEX "pos_inventory_inbound_receipts_shoppingRequestId_status_idx"
  ON "pos_inventory_inbound_receipts"("shoppingRequestId", "status");
CREATE INDEX "pos_inventory_inbound_receipts_supplierId_createdAt_idx"
  ON "pos_inventory_inbound_receipts"("supplierId", "createdAt");
CREATE INDEX "pos_inventory_inbound_receipts_submittedBy_status_idx"
  ON "pos_inventory_inbound_receipts"("submittedBy", "status");

CREATE INDEX "pos_inventory_inbound_receipt_lines_receiptId_idx"
  ON "pos_inventory_inbound_receipt_lines"("receiptId");
CREATE INDEX "pos_inventory_inbound_receipt_lines_productId_idx"
  ON "pos_inventory_inbound_receipt_lines"("productId");
CREATE INDEX "pos_inventory_inbound_receipt_lines_shoppingRequestItemId_idx"
  ON "pos_inventory_inbound_receipt_lines"("shoppingRequestItemId");
CREATE INDEX "pos_inventory_inbound_receipt_lines_inventoryLogId_idx"
  ON "pos_inventory_inbound_receipt_lines"("inventoryLogId");

ALTER TABLE "pos_inventory_log_verifications"
  ADD CONSTRAINT "pos_inventory_log_verifications_inventoryLogId_fkey"
  FOREIGN KEY ("inventoryLogId") REFERENCES "pos_inventory_logs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_log_verifications"
  ADD CONSTRAINT "pos_inventory_log_verifications_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_log_verifications"
  ADD CONSTRAINT "pos_inventory_log_verifications_verifiedBy_fkey"
  FOREIGN KEY ("verifiedBy") REFERENCES "pos_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_tasks"
  ADD CONSTRAINT "pos_inventory_tasks_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_tasks"
  ADD CONSTRAINT "pos_inventory_tasks_submittedBy_fkey"
  FOREIGN KEY ("submittedBy") REFERENCES "pos_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_inbound_receipts"
  ADD CONSTRAINT "pos_inventory_inbound_receipts_approvedBy_fkey"
  FOREIGN KEY ("approvedBy") REFERENCES "pos_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_inbound_receipts"
  ADD CONSTRAINT "pos_inventory_inbound_receipts_shoppingRequestId_fkey"
  FOREIGN KEY ("shoppingRequestId") REFERENCES "pos_shopping_requests"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_inbound_receipts"
  ADD CONSTRAINT "pos_inventory_inbound_receipts_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_inbound_receipts"
  ADD CONSTRAINT "pos_inventory_inbound_receipts_submittedBy_fkey"
  FOREIGN KEY ("submittedBy") REFERENCES "pos_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_inbound_receipts"
  ADD CONSTRAINT "pos_inventory_inbound_receipts_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "pos_suppliers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_inbound_receipt_lines"
  ADD CONSTRAINT "pos_inventory_inbound_receipt_lines_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "pos_products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_inbound_receipt_lines"
  ADD CONSTRAINT "pos_inventory_inbound_receipt_lines_receiptId_fkey"
  FOREIGN KEY ("receiptId") REFERENCES "pos_inventory_inbound_receipts"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_inbound_receipt_lines"
  ADD CONSTRAINT "pos_inventory_inbound_receipt_lines_shoppingRequestItemId_fkey"
  FOREIGN KEY ("shoppingRequestItemId") REFERENCES "pos_shopping_request_items"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
