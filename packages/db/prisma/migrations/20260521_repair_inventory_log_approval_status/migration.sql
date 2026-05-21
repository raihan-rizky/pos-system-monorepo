DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type
        WHERE typname = 'InventoryLogStatus'
    ) THEN
        CREATE TYPE "InventoryLogStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
    END IF;
END $$;

ALTER TABLE "pos_inventory_logs"
    ADD COLUMN IF NOT EXISTS "status" "InventoryLogStatus" NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN IF NOT EXISTS "approvedBy" TEXT,
    ADD COLUMN IF NOT EXISTS "approverName" TEXT,
    ADD COLUMN IF NOT EXISTS "decidedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT;

UPDATE "pos_inventory_logs"
SET "decidedAt" = "createdAt",
    "approvedBy" = "createdBy",
    "approverName" = "person"
WHERE "status" = 'APPROVED' AND "decidedAt" IS NULL;

CREATE INDEX IF NOT EXISTS "pos_inventory_logs_status_createdAt_idx"
    ON "pos_inventory_logs"("status", "createdAt");
