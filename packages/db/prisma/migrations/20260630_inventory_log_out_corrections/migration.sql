CREATE TYPE "InventoryLogCorrectionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "InventoryLogCorrectionMovementKind" AS ENUM ('NET', 'REVERSAL', 'REPLACEMENT');

CREATE TABLE "pos_inventory_log_correction_requests" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "inventoryLogId" TEXT NOT NULL,
  "correctedProductId" TEXT NOT NULL,
  "correctedQuantity" DOUBLE PRECISION NOT NULL,
  "correctedReason" "InventoryReason" NOT NULL,
  "correctedNote" TEXT,
  "status" "InventoryLogCorrectionStatus" NOT NULL DEFAULT 'PENDING',
  "requestedBy" TEXT NOT NULL,
  "decidedBy" TEXT,
  "decidedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pos_inventory_log_correction_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_inventory_log_correction_movements" (
  "id" TEXT NOT NULL,
  "correctionRequestId" TEXT NOT NULL,
  "inventoryLogId" TEXT NOT NULL,
  "kind" "InventoryLogCorrectionMovementKind" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_inventory_log_correction_movements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_inventory_log_correction_requests_storeId_status_createdAt_idx"
  ON "pos_inventory_log_correction_requests"("storeId", "status", "createdAt");
CREATE INDEX "pos_inventory_log_correction_requests_inventoryLogId_status_createdAt_idx"
  ON "pos_inventory_log_correction_requests"("inventoryLogId", "status", "createdAt");
CREATE INDEX "pos_inventory_log_correction_requests_correctedProductId_idx"
  ON "pos_inventory_log_correction_requests"("correctedProductId");
CREATE INDEX "pos_inventory_log_correction_requests_requestedBy_createdAt_idx"
  ON "pos_inventory_log_correction_requests"("requestedBy", "createdAt");
CREATE UNIQUE INDEX "pos_inventory_log_correction_movements_inventoryLogId_key"
  ON "pos_inventory_log_correction_movements"("inventoryLogId");
CREATE INDEX "pos_inventory_log_correction_movements_correctionRequestId_kind_idx"
  ON "pos_inventory_log_correction_movements"("correctionRequestId", "kind");

ALTER TABLE "pos_inventory_log_correction_requests"
  ADD CONSTRAINT "pos_inventory_log_correction_requests_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_inventory_log_correction_requests"
  ADD CONSTRAINT "pos_inventory_log_correction_requests_inventoryLogId_fkey"
  FOREIGN KEY ("inventoryLogId") REFERENCES "pos_inventory_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_inventory_log_correction_requests"
  ADD CONSTRAINT "pos_inventory_log_correction_requests_correctedProductId_fkey"
  FOREIGN KEY ("correctedProductId") REFERENCES "pos_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_inventory_log_correction_requests"
  ADD CONSTRAINT "pos_inventory_log_correction_requests_requestedBy_fkey"
  FOREIGN KEY ("requestedBy") REFERENCES "pos_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_inventory_log_correction_requests"
  ADD CONSTRAINT "pos_inventory_log_correction_requests_decidedBy_fkey"
  FOREIGN KEY ("decidedBy") REFERENCES "pos_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pos_inventory_log_correction_movements"
  ADD CONSTRAINT "pos_inventory_log_correction_movements_correctionRequestId_fkey"
  FOREIGN KEY ("correctionRequestId") REFERENCES "pos_inventory_log_correction_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pos_inventory_log_correction_movements"
  ADD CONSTRAINT "pos_inventory_log_correction_movements_inventoryLogId_fkey"
  FOREIGN KEY ("inventoryLogId") REFERENCES "pos_inventory_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
