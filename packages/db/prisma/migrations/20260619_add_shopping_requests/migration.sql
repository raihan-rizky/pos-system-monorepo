-- CreateEnum
CREATE TYPE "ShoppingRequestStatus" AS ENUM ('DRAFT', 'APPROVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "pos_shopping_requests" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "supplierId" TEXT,
  "status" "ShoppingRequestStatus" NOT NULL DEFAULT 'DRAFT',
  "requestedByName" TEXT,
  "approvedById" TEXT,
  "approvedByName" TEXT,
  "approvedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pos_shopping_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_shopping_request_items" (
  "id" TEXT NOT NULL,
  "shoppingRequestId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "unit" TEXT,
  "stockOnHand" DOUBLE PRECISION NOT NULL,
  "requestedQty" DOUBLE PRECISION NOT NULL,
  "approvedQty" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pos_shopping_request_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pos_shopping_requests_number_key" ON "pos_shopping_requests"("number");

-- CreateIndex
CREATE INDEX "pos_shopping_requests_storeId_createdAt_idx" ON "pos_shopping_requests"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "pos_shopping_requests_status_createdAt_idx" ON "pos_shopping_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "pos_shopping_requests_supplierId_createdAt_idx" ON "pos_shopping_requests"("supplierId", "createdAt");

-- CreateIndex
CREATE INDEX "pos_shopping_request_items_shoppingRequestId_idx" ON "pos_shopping_request_items"("shoppingRequestId");

-- CreateIndex
CREATE INDEX "pos_shopping_request_items_productId_idx" ON "pos_shopping_request_items"("productId");

-- AddForeignKey
ALTER TABLE "pos_shopping_requests"
ADD CONSTRAINT "pos_shopping_requests_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_shopping_requests"
ADD CONSTRAINT "pos_shopping_requests_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "pos_suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_shopping_request_items"
ADD CONSTRAINT "pos_shopping_request_items_shoppingRequestId_fkey"
FOREIGN KEY ("shoppingRequestId") REFERENCES "pos_shopping_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_shopping_request_items"
ADD CONSTRAINT "pos_shopping_request_items_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "pos_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
