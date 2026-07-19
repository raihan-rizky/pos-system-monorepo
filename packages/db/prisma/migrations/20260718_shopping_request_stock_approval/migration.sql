ALTER TYPE "ShoppingRequestStatus" RENAME VALUE 'DRAFT' TO 'REQUESTED';

CREATE TYPE "ShoppingRequestStockMode" AS ENUM ('GROUP_STOCK', 'PRODUCT_ONLY');

ALTER TABLE "pos_shopping_requests"
  ADD COLUMN "stockAppliedAt" TIMESTAMP(3);

ALTER TABLE "pos_shopping_request_items"
  ADD COLUMN "stockMode" "ShoppingRequestStockMode" NOT NULL DEFAULT 'PRODUCT_ONLY';

CREATE INDEX "pos_shopping_requests_status_stockAppliedAt_idx"
  ON "pos_shopping_requests"("status", "stockAppliedAt");
