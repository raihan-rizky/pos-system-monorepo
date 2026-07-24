CREATE TYPE "GoodsPurchaseStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "GoodsPurchaseItemReviewStatus" AS ENUM ('PENDING', 'APPROVED');

CREATE TABLE "pos_goods_purchases" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "shoppingRequestId" TEXT NOT NULL,
  "activeShoppingRequestKey" TEXT,
  "supplierId" TEXT,
  "supplierNameSnapshot" TEXT NOT NULL,
  "status" "GoodsPurchaseStatus" NOT NULL DEFAULT 'PENDING',
  "totalAmount" DECIMAL(12,2) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdByName" TEXT,
  "approvedById" TEXT,
  "approvedByName" TEXT,
  "rejectedById" TEXT,
  "rejectedByName" TEXT,
  "rejectionReason" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pos_goods_purchases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_goods_purchase_items" (
  "id" TEXT NOT NULL,
  "goodsPurchaseId" TEXT NOT NULL,
  "shoppingRequestItemId" TEXT,
  "productId" TEXT NOT NULL,
  "productNameSnapshot" TEXT NOT NULL,
  "skuSnapshot" TEXT NOT NULL,
  "unitSnapshot" TEXT,
  "unitMultiplierSnapshot" DOUBLE PRECISION NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "masterCostPriceSnapshot" DECIMAL(12,2),
  "latestUnitPrice" DECIMAL(12,2) NOT NULL,
  "lineTotal" DECIMAL(12,2) NOT NULL,
  "updateMasterHpp" BOOLEAN NOT NULL DEFAULT false,
  "reviewStatus" "GoodsPurchaseItemReviewStatus" NOT NULL DEFAULT 'PENDING',
  "approvedById" TEXT,
  "approvedByName" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pos_goods_purchase_items_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pos_expenses"
  ADD COLUMN "goodsPurchaseId" TEXT;

CREATE UNIQUE INDEX "pos_goods_purchases_storeId_number_key"
  ON "pos_goods_purchases"("storeId", "number");

CREATE UNIQUE INDEX "pos_goods_purchases_activeShoppingRequestKey_key"
  ON "pos_goods_purchases"("activeShoppingRequestKey");

CREATE INDEX "pos_goods_purchases_storeId_status_createdAt_idx"
  ON "pos_goods_purchases"("storeId", "status", "createdAt");

CREATE INDEX "pos_goods_purchases_shoppingRequestId_createdAt_idx"
  ON "pos_goods_purchases"("shoppingRequestId", "createdAt");

CREATE INDEX "pos_goods_purchases_supplierId_createdAt_idx"
  ON "pos_goods_purchases"("supplierId", "createdAt");

CREATE UNIQUE INDEX "pos_goods_purchase_items_goodsPurchaseId_productId_key"
  ON "pos_goods_purchase_items"("goodsPurchaseId", "productId");

CREATE INDEX "pos_goods_purchase_items_goodsPurchaseId_reviewStatus_idx"
  ON "pos_goods_purchase_items"("goodsPurchaseId", "reviewStatus");

CREATE INDEX "pos_goods_purchase_items_productId_idx"
  ON "pos_goods_purchase_items"("productId");

CREATE INDEX "pos_goods_purchase_items_shoppingRequestItemId_idx"
  ON "pos_goods_purchase_items"("shoppingRequestItemId");

CREATE UNIQUE INDEX "pos_expenses_goodsPurchaseId_key"
  ON "pos_expenses"("goodsPurchaseId");

ALTER TABLE "pos_goods_purchases"
  ADD CONSTRAINT "pos_goods_purchases_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pos_goods_purchases_shoppingRequestId_fkey"
    FOREIGN KEY ("shoppingRequestId") REFERENCES "pos_shopping_requests"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pos_goods_purchases_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "pos_suppliers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "pos_goods_purchases_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "pos_users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pos_goods_purchases_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "pos_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "pos_goods_purchases_rejectedById_fkey"
    FOREIGN KEY ("rejectedById") REFERENCES "pos_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_goods_purchase_items"
  ADD CONSTRAINT "pos_goods_purchase_items_goodsPurchaseId_fkey"
    FOREIGN KEY ("goodsPurchaseId") REFERENCES "pos_goods_purchases"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "pos_goods_purchase_items_shoppingRequestItemId_fkey"
    FOREIGN KEY ("shoppingRequestItemId") REFERENCES "pos_shopping_request_items"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "pos_goods_purchase_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "pos_products"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "pos_goods_purchase_items_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "pos_users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_expenses"
  ADD CONSTRAINT "pos_expenses_goodsPurchaseId_fkey"
    FOREIGN KEY ("goodsPurchaseId") REFERENCES "pos_goods_purchases"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
