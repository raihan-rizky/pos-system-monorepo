CREATE TYPE "ShoppingRequestItemDecisionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "pos_shopping_request_items"
  ADD COLUMN "decisionStatus" "ShoppingRequestItemDecisionStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "decidedById" TEXT,
  ADD COLUMN "decidedByName" TEXT,
  ADD COLUMN "decidedAt" TIMESTAMP(3),
  ADD COLUMN "stockAppliedAt" TIMESTAMP(3);

UPDATE "pos_shopping_request_items" AS item
SET
  "approvedQty" = COALESCE(item."approvedQty", item."requestedQty"),
  "decisionStatus" = CASE
    WHEN COALESCE(item."approvedQty", item."requestedQty") = 0 THEN 'REJECTED'::"ShoppingRequestItemDecisionStatus"
    ELSE 'APPROVED'::"ShoppingRequestItemDecisionStatus"
  END,
  "decidedById" = request."approvedById",
  "decidedByName" = request."approvedByName",
  "decidedAt" = request."approvedAt",
  "stockAppliedAt" = CASE
    WHEN COALESCE(item."approvedQty", item."requestedQty") > 0 THEN request."stockAppliedAt"
    ELSE NULL
  END
FROM "pos_shopping_requests" AS request
WHERE request."id" = item."shoppingRequestId"
  AND request."status" = 'APPROVED';

CREATE INDEX "pos_shopping_request_items_shoppingRequestId_decisionStatus_idx"
  ON "pos_shopping_request_items"("shoppingRequestId", "decisionStatus");
