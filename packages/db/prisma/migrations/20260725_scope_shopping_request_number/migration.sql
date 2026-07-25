DROP INDEX IF EXISTS "pos_shopping_requests_number_key";

CREATE UNIQUE INDEX "pos_shopping_requests_storeId_number_key"
  ON "pos_shopping_requests"("storeId", "number");
