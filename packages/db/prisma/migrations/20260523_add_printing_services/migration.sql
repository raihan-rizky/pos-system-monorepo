CREATE TABLE IF NOT EXISTS "pos_printing_services" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basePrice" DECIMAL(12,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_printing_services_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pos_printing_services"
    ADD CONSTRAINT "pos_printing_services_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "pos_printing_services_storeId_isActive_idx"
    ON "pos_printing_services"("storeId", "isActive");

CREATE INDEX IF NOT EXISTS "pos_printing_services_storeId_name_idx"
    ON "pos_printing_services"("storeId", "name");

ALTER TABLE "pos_transaction_items"
    ALTER COLUMN "productId" DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS "printingServiceId" TEXT,
    ADD COLUMN IF NOT EXISTS "rawMaterialProductId" TEXT,
    ADD COLUMN IF NOT EXISTS "serviceNote" TEXT,
    ADD COLUMN IF NOT EXISTS "rawMaterialQuantity" DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS "rawMaterialUnit" TEXT;

CREATE INDEX IF NOT EXISTS "pos_transaction_items_printingServiceId_idx"
    ON "pos_transaction_items"("printingServiceId");

CREATE INDEX IF NOT EXISTS "pos_transaction_items_rawMaterialProductId_idx"
    ON "pos_transaction_items"("rawMaterialProductId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pos_transaction_items_printingServiceId_fkey'
    ) THEN
        ALTER TABLE "pos_transaction_items"
            ADD CONSTRAINT "pos_transaction_items_printingServiceId_fkey"
            FOREIGN KEY ("printingServiceId") REFERENCES "pos_printing_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pos_transaction_items_rawMaterialProductId_fkey'
    ) THEN
        ALTER TABLE "pos_transaction_items"
            ADD CONSTRAINT "pos_transaction_items_rawMaterialProductId_fkey"
            FOREIGN KEY ("rawMaterialProductId") REFERENCES "pos_products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
