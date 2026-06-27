CREATE TYPE "InventoryTaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

CREATE TABLE "pos_inventory_task_checklist_items" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "periodType" "InventoryTaskPeriod" NOT NULL,
  "periodKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "dueTime" TEXT,
  "priority" "InventoryTaskPriority" NOT NULL DEFAULT 'NORMAL',
  "isCompleted" BOOLEAN NOT NULL DEFAULT false,
  "completedById" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pos_inventory_task_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_inv_task_checklist_period_idx"
  ON "pos_inventory_task_checklist_items"("storeId", "periodType", "periodKey");
CREATE INDEX "pos_inv_task_checklist_period_done_idx"
  ON "pos_inventory_task_checklist_items"("storeId", "periodType", "periodKey", "isCompleted");
CREATE INDEX "pos_inventory_task_checklist_items_completedById_completedAt_idx"
  ON "pos_inventory_task_checklist_items"("completedById", "completedAt");

ALTER TABLE "pos_inventory_task_checklist_items"
  ADD CONSTRAINT "pos_inventory_task_checklist_items_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_task_checklist_items"
  ADD CONSTRAINT "pos_inventory_task_checklist_items_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "pos_users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_task_checklist_items"
  ADD CONSTRAINT "pos_inventory_task_checklist_items_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "pos_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_task_checklist_items"
  ADD CONSTRAINT "pos_inventory_task_checklist_items_completedById_fkey"
  FOREIGN KEY ("completedById") REFERENCES "pos_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
