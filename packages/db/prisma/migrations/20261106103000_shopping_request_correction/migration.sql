CREATE TYPE "GoodsPurchaseTotalBasis" AS ENUM ('ORDERED', 'RECEIVED');
ALTER TABLE "pos_goods_purchases" ADD COLUMN "totalBasis" "GoodsPurchaseTotalBasis" NOT NULL DEFAULT 'ORDERED';
ALTER TABLE "pos_shopping_requests" ADD COLUMN "businessDate" DATE;
-- Retain item identifiers used by receipts, stock movements, and correction history.
ALTER TABLE "pos_shopping_request_items" ADD COLUMN "removedAt" TIMESTAMP(3);
ALTER TABLE "pos_goods_purchase_items" ADD COLUMN "removedAt" TIMESTAMP(3);

-- A corrected purchase may have no received goods. Keep manual debts positive.
ALTER TABLE "pos_supplier_payables" DROP CONSTRAINT IF EXISTS "pos_supplier_payables_amount_check";
ALTER TABLE "pos_supplier_payables" ADD CONSTRAINT "pos_supplier_payables_amount_check"
  CHECK ("amount" > 0 OR ("amount" = 0 AND "goodsPurchaseId" IS NOT NULL));

CREATE TABLE "pos_shopping_request_corrections" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "shoppingRequestId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "actorName" TEXT,
  "reason" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "beforeSnapshot" JSONB NOT NULL,
  "afterSnapshot" JSONB NOT NULL,
  "preview" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pos_shopping_request_corrections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_shopping_request_corrections_request_fkey" FOREIGN KEY ("shoppingRequestId") REFERENCES "pos_shopping_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "pos_shopping_request_corrections_idempotency_key" ON "pos_shopping_request_corrections"("storeId", "shoppingRequestId", "idempotencyKey");
CREATE INDEX "pos_shopping_request_corrections_store_request_created_idx" ON "pos_shopping_request_corrections"("storeId", "shoppingRequestId", "createdAt");

CREATE TABLE "pos_shopping_request_correction_movements" (
  "id" TEXT NOT NULL,
  "correctionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "shoppingRequestItemId" TEXT,
  "goodsPurchaseItemId" TEXT,
  "receiptLineId" TEXT,
  "inventoryLogId" TEXT,
  "stockGroupId" TEXT,
  "oldReceivedQty" DOUBLE PRECISION NOT NULL,
  "newReceivedQty" DOUBLE PRECISION NOT NULL,
  "baseDelta" DOUBLE PRECISION NOT NULL,
  "details" JSONB NOT NULL,
  CONSTRAINT "pos_shopping_request_correction_movements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_shopping_request_correction_movements_correction_fkey" FOREIGN KEY ("correctionId") REFERENCES "pos_shopping_request_corrections"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pos_shopping_request_correction_movements_qty_check" CHECK ("oldReceivedQty" >= 0 AND "newReceivedQty" >= 0)
);
CREATE INDEX "pos_shopping_request_correction_movements_correction_idx" ON "pos_shopping_request_correction_movements"("correctionId");
CREATE INDEX "pos_shopping_request_correction_movements_line_idx" ON "pos_shopping_request_correction_movements"("receiptLineId");

CREATE TABLE "pos_shopping_request_correction_allocations" (
  "id" TEXT NOT NULL,
  "correctionId" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "sourceKind" TEXT NOT NULL,
  "method" "PurchasePaymentMethod" NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "sourceAmount" DECIMAL(12, 2) NOT NULL,
  "paidAt" DATE NOT NULL,
  "details" JSONB NOT NULL,
  CONSTRAINT "pos_shopping_request_correction_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_shopping_request_correction_allocations_correction_fkey" FOREIGN KEY ("correctionId") REFERENCES "pos_shopping_request_corrections"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pos_shopping_request_correction_allocations_amount_check" CHECK ("amount" >= 0 AND "sourceAmount" >= 0),
  CONSTRAINT "pos_shopping_request_correction_allocations_source_check" CHECK ("sourceKind" IN ('TRANSFER_EXPENSE', 'PAYABLE_PAYMENT'))
);
CREATE UNIQUE INDEX "pos_shopping_request_correction_allocations_payment_key" ON "pos_shopping_request_correction_allocations"("correctionId", "sourceKind", "paymentId", "method");

-- Audit is accessed by server-side Prisma, never by the public Data API.
ALTER TABLE "pos_shopping_request_corrections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_shopping_request_correction_movements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pos_shopping_request_correction_allocations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pos_shopping_request_corrections", "pos_shopping_request_correction_movements", "pos_shopping_request_correction_allocations" FROM PUBLIC;
DO $$
DECLARE api_role TEXT;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL ON TABLE "pos_shopping_request_corrections", "pos_shopping_request_correction_movements", "pos_shopping_request_correction_allocations" FROM %I', api_role);
  END LOOP;
END;
$$;
