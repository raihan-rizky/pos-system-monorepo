-- Create pos_salespersons table
CREATE TABLE IF NOT EXISTS "pos_salespersons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "storeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_salespersons_pkey" PRIMARY KEY ("id")
);

-- Add foreign key for storeId
ALTER TABLE "pos_salespersons" ADD CONSTRAINT "pos_salespersons_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create index on storeId
CREATE INDEX "pos_salespersons_storeId_idx" ON "pos_salespersons"("storeId");

-- Alter pos_transactions to add salespersonId
ALTER TABLE "pos_transactions" ADD COLUMN "salespersonId" TEXT;

-- Add foreign key from pos_transactions to pos_salespersons
ALTER TABLE "pos_transactions" ADD CONSTRAINT "pos_transactions_salespersonId_fkey" FOREIGN KEY ("salespersonId") REFERENCES "pos_salespersons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Create index on salespersonId in transactions
CREATE INDEX "pos_transactions_salespersonId_idx" ON "pos_transactions"("salespersonId");
