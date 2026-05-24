CREATE TYPE "ProductionActivityEventType" AS ENUM ('STATUS_CHANGE', 'PICKUP_WHATSAPP_SENT');

ALTER TABLE "pos_production_activity_logs"
  ADD COLUMN "eventType" "ProductionActivityEventType" NOT NULL DEFAULT 'STATUS_CHANGE',
  ADD COLUMN "note" TEXT;

CREATE INDEX "pos_production_activity_logs_eventType_createdAt_idx"
  ON "pos_production_activity_logs"("eventType", "createdAt");
