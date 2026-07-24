CREATE TYPE "GoodsPurchaseFulfillmentStatus" AS ENUM ('NOT_RECEIVED', 'PARTIALLY_RECEIVED', 'RECEIVED');
CREATE TYPE "InventoryInboundReceiptMatchStatus" AS ENUM ('MATCHED', 'MISMATCHED');
CREATE TYPE "InventoryInboundReceiptLineReviewStatus" AS ENUM ('PENDING', 'APPROVED');

ALTER TYPE "BatchOperationType" ADD VALUE IF NOT EXISTS 'INBOUND_RECEIPT';

ALTER TABLE "pos_goods_purchases"
  ADD COLUMN "fulfillmentStatus" "GoodsPurchaseFulfillmentStatus" NOT NULL DEFAULT 'NOT_RECEIVED';

ALTER TABLE "pos_inventory_inbound_receipts"
  ADD COLUMN "goodsPurchaseId" TEXT,
  ADD COLUMN "stockBundleId" TEXT;

ALTER TABLE "pos_inventory_inbound_receipt_lines"
  ADD COLUMN "goodsPurchaseItemId" TEXT,
  ADD COLUMN "matchStatus" "InventoryInboundReceiptMatchStatus",
  ADD COLUMN "reviewStatus" "InventoryInboundReceiptLineReviewStatus",
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedByName" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "pos_inventory_inbound_receipts_stockBundleId_key"
  ON "pos_inventory_inbound_receipts"("stockBundleId");

CREATE INDEX "pos_inventory_inbound_receipts_goodsPurchaseId_status_createdAt_idx"
  ON "pos_inventory_inbound_receipts"("goodsPurchaseId", "status", "createdAt");

CREATE UNIQUE INDEX "pos_inventory_inbound_receipt_lines_receiptId_goodsPurchaseItemId_key"
  ON "pos_inventory_inbound_receipt_lines"("receiptId", "goodsPurchaseItemId");

CREATE INDEX "pos_inventory_inbound_receipt_lines_goodsPurchaseItemId_reviewStatus_idx"
  ON "pos_inventory_inbound_receipt_lines"("goodsPurchaseItemId", "reviewStatus");

ALTER TABLE "pos_inventory_inbound_receipts"
  ADD CONSTRAINT "pos_inventory_inbound_receipts_goodsPurchaseId_fkey"
    FOREIGN KEY ("goodsPurchaseId") REFERENCES "pos_goods_purchases"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "pos_inventory_inbound_receipts_stockBundleId_fkey"
    FOREIGN KEY ("stockBundleId") REFERENCES "pos_batch_operations"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_inbound_receipt_lines"
  ADD CONSTRAINT "pos_inventory_inbound_receipt_lines_goodsPurchaseItemId_fkey"
    FOREIGN KEY ("goodsPurchaseItemId") REFERENCES "pos_goods_purchase_items"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
