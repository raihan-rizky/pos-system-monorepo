-- CreateEnum
CREATE TYPE "InventoryLogStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "pos_inventory_logs"
    ADD COLUMN "status" "InventoryLogStatus" NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN "approvedBy" TEXT,
    ADD COLUMN "approverName" TEXT,
    ADD COLUMN "decidedAt" TIMESTAMP(3),
    ADD COLUMN "rejectionReason" TEXT;

-- Backfill: existing rows are committed changes, mark them as decided at creation time
UPDATE "pos_inventory_logs"
SET "decidedAt" = "createdAt",
    "approvedBy" = "createdBy",
    "approverName" = "person"
WHERE "status" = 'APPROVED' AND "decidedAt" IS NULL;

-- CreateIndex
CREATE INDEX "pos_inventory_logs_status_createdAt_idx" ON "pos_inventory_logs"("status", "createdAt");
