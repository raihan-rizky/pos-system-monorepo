-- Create enum for internal stock-out request status
CREATE TYPE "InternalStockOutRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- Create internal stock-out requests table
CREATE TABLE "pos_internal_stock_out_requests" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "InternalStockOutRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestedBy" TEXT NOT NULL,
  "requestedByName" TEXT NOT NULL,
  "requestedByRole" "Role" NOT NULL,
  "approvedBy" TEXT,
  "approvedByName" TEXT,
  "approvedAt" TIMESTAMP(3),
  "rejectedBy" TEXT,
  "rejectedByName" TEXT,
  "rejectedAt" TIMESTAMP(3),
  "rejectionReason" TEXT,
  "inventoryLogId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pos_internal_stock_out_requests_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "pos_internal_stock_out_requests_storeId_status_createdAt_idx"
  ON "pos_internal_stock_out_requests"("storeId", "status", "createdAt");
CREATE INDEX "pos_internal_stock_out_requests_productId_status_idx"
  ON "pos_internal_stock_out_requests"("productId", "status");
CREATE INDEX "pos_internal_stock_out_requests_requestedBy_status_idx"
  ON "pos_internal_stock_out_requests"("requestedBy", "status");
CREATE INDEX "pos_internal_stock_out_requests_inventoryLogId_idx"
  ON "pos_internal_stock_out_requests"("inventoryLogId");

-- Foreign keys
ALTER TABLE "pos_internal_stock_out_requests"
  ADD CONSTRAINT "pos_internal_stock_out_requests_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_internal_stock_out_requests"
  ADD CONSTRAINT "pos_internal_stock_out_requests_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "pos_products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_internal_stock_out_requests"
  ADD CONSTRAINT "pos_internal_stock_out_requests_requestedBy_fkey"
  FOREIGN KEY ("requestedBy") REFERENCES "pos_users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_internal_stock_out_requests"
  ADD CONSTRAINT "pos_internal_stock_out_requests_approvedBy_fkey"
  FOREIGN KEY ("approvedBy") REFERENCES "pos_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_internal_stock_out_requests"
  ADD CONSTRAINT "pos_internal_stock_out_requests_rejectedBy_fkey"
  FOREIGN KEY ("rejectedBy") REFERENCES "pos_users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
