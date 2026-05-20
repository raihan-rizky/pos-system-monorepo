-- CreateEnum
CREATE TYPE "InventoryReason" AS ENUM ('SALE', 'SALE_RETURN', 'RESTOCK', 'SUPPLIER_RETURN', 'WASTE', 'USAGE', 'OPNAME', 'MANUAL_ADJUSTMENT');

-- AlterTable
ALTER TABLE "pos_inventory_logs"
    ADD COLUMN "reason" "InventoryReason",
    ADD COLUMN "unitCost" DECIMAL(12,2);

-- CreateIndex
CREATE INDEX "pos_inventory_logs_reason_createdAt_idx" ON "pos_inventory_logs"("reason", "createdAt");
