CREATE TABLE "pos_bulk_stock_import_jobs" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "createdByName" TEXT,
  "createdByRole" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "phase" TEXT NOT NULL DEFAULT 'QUEUED',
  "totalRows" INTEGER NOT NULL,
  "processedRows" INTEGER NOT NULL DEFAULT 0,
  "successRows" INTEGER NOT NULL DEFAULT 0,
  "failedRows" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3),
  "retainUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pos_bulk_stock_import_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pos_bulk_stock_import_jobs_storeId_status_idx"
  ON "pos_bulk_stock_import_jobs"("storeId", "status");

CREATE INDEX "pos_bulk_stock_import_jobs_status_lastHeartbeatAt_idx"
  ON "pos_bulk_stock_import_jobs"("status", "lastHeartbeatAt");

CREATE INDEX "pos_bulk_stock_import_jobs_retainUntil_idx"
  ON "pos_bulk_stock_import_jobs"("retainUntil");
