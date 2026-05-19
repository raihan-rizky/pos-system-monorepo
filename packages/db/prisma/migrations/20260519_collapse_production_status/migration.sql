-- Collapse production status enum: drop PENDING, DESIGNING, FINISHING.
-- Existing rows in those statuses are migrated to PRINTING.
-- Forward-only migration; no down path is provided.

BEGIN;

UPDATE pos_transactions
SET "productionStatus" = 'PRINTING'
WHERE "productionStatus" IN ('PENDING', 'DESIGNING', 'FINISHING');

ALTER TYPE "ProductionStatus" RENAME TO "ProductionStatus_old";

CREATE TYPE "ProductionStatus" AS ENUM ('PRINTING', 'READY_PICKUP', 'DELIVERED');

ALTER TABLE pos_transactions
  ALTER COLUMN "productionStatus" TYPE "ProductionStatus"
  USING "productionStatus"::text::"ProductionStatus";

DROP TYPE "ProductionStatus_old";

COMMIT;
