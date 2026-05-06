-- RBAC Migration: Role enum, TransactionStatus, and Transaction model changes
-- This migration:
-- 1. Renames MANAGER → SALES in the Role enum
-- 2. Adds PENDING_APPROVAL to TransactionStatus enum
-- 3. Makes cashierId nullable on pos_transactions
-- 4. Adds requestedById column and index on pos_transactions
-- 5. Adds status index on pos_transactions

-- Step 1: Rename MANAGER to SALES
ALTER TYPE "Role" RENAME VALUE 'MANAGER' TO 'SALES';

-- Step 2: Add PENDING_APPROVAL to TransactionStatus
ALTER TYPE "TransactionStatus" ADD VALUE 'PENDING_APPROVAL' BEFORE 'COMPLETED';

-- Step 3: Make cashierId nullable
ALTER TABLE "pos_transactions" ALTER COLUMN "cashierId" DROP NOT NULL;

-- Step 4: Set default for amountPaid (was required, now defaults to 0 for SALES requests)
ALTER TABLE "pos_transactions" ALTER COLUMN "amountPaid" SET DEFAULT 0;

-- Step 5: Add requestedById column
ALTER TABLE "pos_transactions" ADD COLUMN "requestedById" TEXT;

-- Step 6: Add foreign key for requestedById
ALTER TABLE "pos_transactions" ADD CONSTRAINT "pos_transactions_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "pos_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Step 7: Add indexes
CREATE INDEX IF NOT EXISTS "pos_transactions_requestedById_idx" ON "pos_transactions"("requestedById");
CREATE INDEX IF NOT EXISTS "pos_transactions_status_idx" ON "pos_transactions"("status");
