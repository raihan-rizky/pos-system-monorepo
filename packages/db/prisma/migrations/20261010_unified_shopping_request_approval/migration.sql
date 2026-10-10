ALTER TYPE "ShoppingRequestStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

ALTER TABLE "pos_shopping_requests"
  ADD COLUMN "approvalFlowVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedById" TEXT,
  ADD COLUMN "rejectedByName" TEXT,
  ADD COLUMN "rejectionReason" TEXT;
