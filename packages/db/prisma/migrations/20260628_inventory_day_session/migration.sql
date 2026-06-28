CREATE TABLE "pos_inventory_day_sessions" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NOT_CHECKED_IN',
  "morningCheckSnapshot" JSONB,
  "checkOutSnapshot" JSONB,
  "checkInById" TEXT,
  "checkInByName" TEXT,
  "checkedInAt" TIMESTAMP(3),
  "checkOutById" TEXT,
  "checkOutByName" TEXT,
  "checkedOutAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pos_inventory_day_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_inventory_production_materials" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'PINNED',
  "isPinned" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pos_inventory_production_materials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_inventory_day_sessions_storeId_periodKey_key"
  ON "pos_inventory_day_sessions"("storeId", "periodKey");

CREATE INDEX "pos_inventory_day_sessions_storeId_status_periodKey_idx"
  ON "pos_inventory_day_sessions"("storeId", "status", "periodKey");

CREATE INDEX "pos_inventory_day_sessions_checkInById_checkedInAt_idx"
  ON "pos_inventory_day_sessions"("checkInById", "checkedInAt");

CREATE INDEX "pos_inventory_day_sessions_checkOutById_checkedOutAt_idx"
  ON "pos_inventory_day_sessions"("checkOutById", "checkedOutAt");

CREATE UNIQUE INDEX "pos_inventory_production_materials_storeId_productId_key"
  ON "pos_inventory_production_materials"("storeId", "productId");

CREATE INDEX "pos_inventory_production_materials_storeId_isPinned_idx"
  ON "pos_inventory_production_materials"("storeId", "isPinned");

ALTER TABLE "pos_inventory_day_sessions"
  ADD CONSTRAINT "pos_inventory_day_sessions_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_day_sessions"
  ADD CONSTRAINT "pos_inventory_day_sessions_checkInById_fkey"
  FOREIGN KEY ("checkInById") REFERENCES "pos_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_day_sessions"
  ADD CONSTRAINT "pos_inventory_day_sessions_checkOutById_fkey"
  FOREIGN KEY ("checkOutById") REFERENCES "pos_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_production_materials"
  ADD CONSTRAINT "pos_inventory_production_materials_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_inventory_production_materials"
  ADD CONSTRAINT "pos_inventory_production_materials_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "pos_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
