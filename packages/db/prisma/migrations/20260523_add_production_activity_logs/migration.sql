CREATE TABLE "pos_production_activity_logs" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "invoiceNumber" TEXT,
  "customerName" TEXT,
  "fromStatus" "ProductionStatus",
  "toStatus" "ProductionStatus" NOT NULL,
  "actorId" TEXT,
  "actorName" TEXT NOT NULL,
  "actorRole" "Role" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pos_production_activity_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_production_activity_logs_storeId_createdAt_idx"
  ON "pos_production_activity_logs"("storeId", "createdAt");

CREATE INDEX "pos_production_activity_logs_transactionId_createdAt_idx"
  ON "pos_production_activity_logs"("transactionId", "createdAt");

CREATE INDEX "pos_production_activity_logs_actorId_createdAt_idx"
  ON "pos_production_activity_logs"("actorId", "createdAt");

CREATE INDEX "pos_production_activity_logs_fromStatus_toStatus_createdAt_idx"
  ON "pos_production_activity_logs"("fromStatus", "toStatus", "createdAt");

ALTER TABLE "pos_production_activity_logs"
  ADD CONSTRAINT "pos_production_activity_logs_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "pos_transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_production_activity_logs"
  ADD CONSTRAINT "pos_production_activity_logs_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_production_activity_logs"
  ADD CONSTRAINT "pos_production_activity_logs_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "pos_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
