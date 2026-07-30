-- The original custom invoice migration was resolved as applied after failing
-- before these snapshot columns were created. Repair the drift idempotently so
-- both fresh and previously resolved databases match the Prisma schema.
ALTER TABLE "pos_transaction_items"
  ADD COLUMN IF NOT EXISTS "material" TEXT,
  ADD COLUMN IF NOT EXISTS "size" TEXT,
  ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(12,2);
