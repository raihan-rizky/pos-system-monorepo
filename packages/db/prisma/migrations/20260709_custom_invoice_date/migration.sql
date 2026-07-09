ALTER TABLE "pos_transactions"
  ADD COLUMN IF NOT EXISTS "invoiceDate" TIMESTAMP(3);

WITH document_dates AS (
  SELECT
    "id",
    COALESCE(
      substring("invoiceNumber" FROM '^INV-([0-9]{8})-[0-9]+$'),
      substring("draftNumber" FROM '^PNW-TLD-([0-9]{8})-[0-9]+$')
    ) AS "documentDateKey"
  FROM "pos_transactions"
)
UPDATE "pos_transactions" AS t
SET "invoiceDate" =
  CASE
    WHEN d."documentDateKey" IS NOT NULL THEN
      to_date(d."documentDateKey", 'YYYYMMDD')::timestamp
      + (t."createdAt" - date_trunc('day', t."createdAt"))
    ELSE t."createdAt"
  END
FROM document_dates AS d
WHERE t."id" = d."id"
  AND t."invoiceDate" IS NULL;

ALTER TABLE "pos_transactions"
  ALTER COLUMN "invoiceDate" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "invoiceDate" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "pos_transactions_store_invoiceDate_desc_idx"
  ON "pos_transactions"("storeId", "invoiceDate" DESC);

CREATE INDEX IF NOT EXISTS "pos_transactions_store_status_invoiceDate_desc_idx"
  ON "pos_transactions"("storeId", "status", "invoiceDate" DESC);

CREATE TABLE IF NOT EXISTS "pos_invoice_date_change_logs" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "oldInvoiceDate" TIMESTAMP(3) NOT NULL,
  "newInvoiceDate" TIMESTAMP(3) NOT NULL,
  "oldDocumentNumber" TEXT,
  "newDocumentNumber" TEXT,
  "reason" TEXT NOT NULL,
  "actorId" TEXT,
  "actorName" TEXT NOT NULL,
  "actorRole" "Role" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pos_invoice_date_change_logs_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pos_invoice_date_change_logs_transactionId_fkey'
  ) THEN
    ALTER TABLE "pos_invoice_date_change_logs"
      ADD CONSTRAINT "pos_invoice_date_change_logs_transactionId_fkey"
      FOREIGN KEY ("transactionId") REFERENCES "pos_transactions"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pos_invoice_date_change_logs_storeId_fkey'
  ) THEN
    ALTER TABLE "pos_invoice_date_change_logs"
      ADD CONSTRAINT "pos_invoice_date_change_logs_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'pos_invoice_date_change_logs_actorId_fkey'
  ) THEN
    ALTER TABLE "pos_invoice_date_change_logs"
      ADD CONSTRAINT "pos_invoice_date_change_logs_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "pos_users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "pos_invoice_date_change_logs_transactionId_createdAt_idx"
  ON "pos_invoice_date_change_logs"("transactionId", "createdAt");

CREATE INDEX IF NOT EXISTS "pos_invoice_date_change_logs_storeId_createdAt_idx"
  ON "pos_invoice_date_change_logs"("storeId", "createdAt");
