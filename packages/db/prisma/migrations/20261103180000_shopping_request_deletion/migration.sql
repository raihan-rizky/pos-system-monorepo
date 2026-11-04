ALTER TYPE "GoodsPurchaseStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "pos_goods_purchases" ADD COLUMN "statusBeforeCancellation" "GoodsPurchaseStatus";

CREATE TABLE "pos_shopping_request_deletions" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "shoppingRequestId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT,
  "reason" TEXT NOT NULL,
  "previousStatus" "ShoppingRequestStatus" NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_shopping_request_deletions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pos_shopping_request_deletions_shoppingRequestId_key" ON "pos_shopping_request_deletions"("shoppingRequestId");
CREATE INDEX "pos_shopping_request_deletions_storeId_createdAt_idx" ON "pos_shopping_request_deletions"("storeId", "createdAt");
ALTER TABLE "pos_shopping_request_deletions" ADD CONSTRAINT "pos_shopping_request_deletions_shoppingRequestId_fkey" FOREIGN KEY ("shoppingRequestId") REFERENCES "pos_shopping_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The audit is accessed by server-side Prisma, not through the Data API.
ALTER TABLE "pos_shopping_request_deletions" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pos_shopping_request_deletions" FROM PUBLIC;
DO $$
DECLARE api_role TEXT;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL ON TABLE "pos_shopping_request_deletions" FROM %I', api_role);
  END LOOP;
END;
$$;
