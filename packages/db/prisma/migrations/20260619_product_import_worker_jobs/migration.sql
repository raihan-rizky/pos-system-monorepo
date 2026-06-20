-- Product import worker job queue and row state.

CREATE TYPE "ProductImportJobStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'FAILED',
  'CANCEL_REQUESTED',
  'CANCELLED'
);

CREATE TYPE "ProductImportJobRowStatus" AS ENUM (
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'SKIPPED'
);

CREATE TABLE "pos_product_import_jobs" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "batchOperationId" TEXT NOT NULL,
  "status" "ProductImportJobStatus" NOT NULL DEFAULT 'PENDING',
  "totalRows" INTEGER NOT NULL,
  "processedRows" INTEGER NOT NULL DEFAULT 0,
  "successRows" INTEGER NOT NULL DEFAULT 0,
  "failedRows" INTEGER NOT NULL DEFAULT 0,
  "skippedRows" INTEGER NOT NULL DEFAULT 0,
  "chunkSize" INTEGER NOT NULL DEFAULT 1,
  "summary" JSONB NOT NULL,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3),
  "cancelRequestedAt" TIMESTAMP(3),
  "retainUntil" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pos_product_import_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_product_import_job_rows" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "cursorIndex" INTEGER NOT NULL,
  "status" "ProductImportJobRowStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3),
  "commitAction" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "productId" TEXT,
  "rowData" JSONB NOT NULL,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pos_product_import_job_rows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_product_import_jobs_batchOperationId_key"
  ON "pos_product_import_jobs"("batchOperationId");

CREATE INDEX "pos_product_import_jobs_storeId_status_idx"
  ON "pos_product_import_jobs"("storeId", "status");

CREATE INDEX "pos_product_import_jobs_status_lastHeartbeatAt_idx"
  ON "pos_product_import_jobs"("status", "lastHeartbeatAt");

CREATE INDEX "pos_product_import_jobs_retainUntil_idx"
  ON "pos_product_import_jobs"("retainUntil");

CREATE UNIQUE INDEX "pos_product_import_jobs_one_active_per_store_idx"
  ON "pos_product_import_jobs"("storeId")
  WHERE "status" IN ('PENDING', 'RUNNING', 'CANCEL_REQUESTED');

CREATE UNIQUE INDEX "pos_product_import_job_rows_jobId_rowNumber_key"
  ON "pos_product_import_job_rows"("jobId", "rowNumber");

CREATE INDEX "pos_product_import_job_rows_jobId_status_cursorIndex_idx"
  ON "pos_product_import_job_rows"("jobId", "status", "cursorIndex");

CREATE INDEX "pos_product_import_job_rows_jobId_cursorIndex_idx"
  ON "pos_product_import_job_rows"("jobId", "cursorIndex");

ALTER TABLE "pos_product_import_jobs"
  ADD CONSTRAINT "pos_product_import_jobs_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_product_import_jobs"
  ADD CONSTRAINT "pos_product_import_jobs_createdBy_fkey"
  FOREIGN KEY ("createdBy") REFERENCES "pos_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_product_import_jobs"
  ADD CONSTRAINT "pos_product_import_jobs_batchOperationId_fkey"
  FOREIGN KEY ("batchOperationId") REFERENCES "pos_batch_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_product_import_job_rows"
  ADD CONSTRAINT "pos_product_import_job_rows_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "pos_product_import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
