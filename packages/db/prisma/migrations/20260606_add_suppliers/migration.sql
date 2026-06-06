CREATE TYPE "SupplierType" AS ENUM ('DISTRIBUTOR', 'MARKETPLACE', 'INDIVIDUAL', 'MANUFACTURER', 'OTHER');

CREATE TABLE "pos_suppliers" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "SupplierType" NOT NULL,
  "phone" TEXT,
  "contactPerson" TEXT,
  "address" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pos_suppliers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pos_inventory_logs" ADD COLUMN "supplierId" TEXT;

CREATE INDEX "pos_suppliers_isActive_idx" ON "pos_suppliers"("isActive");
CREATE INDEX "pos_suppliers_type_idx" ON "pos_suppliers"("type");
CREATE INDEX "pos_suppliers_name_idx" ON "pos_suppliers"("name");
CREATE INDEX "pos_inventory_logs_supplierId_createdAt_idx" ON "pos_inventory_logs"("supplierId", "createdAt");

ALTER TABLE "pos_inventory_logs"
  ADD CONSTRAINT "pos_inventory_logs_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "pos_suppliers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
