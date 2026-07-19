ALTER TABLE "pos_shopping_request_items"
  ADD COLUMN "costPriceSnapshot" DECIMAL(12,2);

ALTER TABLE "pos_expenses"
  ADD COLUMN "storeId" TEXT,
  ADD COLUMN "shoppingRequestId" TEXT,
  ADD COLUMN "hasMissingCostSnapshot" BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "pos_expenses" AS expense
    JOIN "pos_users" AS actor ON actor."id" = expense."recordedById"
    JOIN "pos_transactions" AS transaction ON transaction."id" = expense."transactionId"
    WHERE actor."storeId" IS NOT NULL
      AND actor."storeId" <> transaction."storeId"
  ) THEN
    RAISE EXCEPTION 'Expense store ownership conflicts between recordedBy and transaction';
  END IF;
END $$;

UPDATE "pos_expenses" AS expense
SET "storeId" = actor."storeId"
FROM "pos_users" AS actor
WHERE actor."id" = expense."recordedById"
  AND actor."storeId" IS NOT NULL
  AND expense."storeId" IS NULL;

UPDATE "pos_expenses" AS expense
SET "storeId" = transaction."storeId"
FROM "pos_transactions" AS transaction
WHERE transaction."id" = expense."transactionId"
  AND expense."storeId" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "pos_expenses" WHERE "storeId" IS NULL) THEN
    RAISE EXCEPTION 'Expense store ownership cannot be determined';
  END IF;
END $$;

ALTER TABLE "pos_expenses"
  ALTER COLUMN "storeId" SET NOT NULL,
  ADD CONSTRAINT "pos_expenses_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pos_expenses_shoppingRequestId_fkey"
    FOREIGN KEY ("shoppingRequestId") REFERENCES "pos_shopping_requests"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "pos_expenses_shoppingRequestId_key"
  ON "pos_expenses"("shoppingRequestId");

CREATE INDEX "pos_expenses_storeId_occurredAt_idx"
  ON "pos_expenses"("storeId", "occurredAt" DESC);

CREATE INDEX "pos_expenses_storeId_deletedAt_occurredAt_idx"
  ON "pos_expenses"("storeId", "deletedAt", "occurredAt" DESC);
