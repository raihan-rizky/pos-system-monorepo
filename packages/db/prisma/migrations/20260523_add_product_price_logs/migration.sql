CREATE TYPE "ProductPriceLogField" AS ENUM ('PRICE', 'COST_PRICE');

CREATE TYPE "ProductPriceLogSource" AS ENUM ('MANUAL', 'IMPORT', 'API', 'SYSTEM');

CREATE TABLE "pos_product_price_logs" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "field" "ProductPriceLogField" NOT NULL,
    "oldValue" DECIMAL(12,2),
    "newValue" DECIMAL(12,2),
    "source" "ProductPriceLogSource" NOT NULL,
    "note" TEXT,
    "changedBy" TEXT,
    "changedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pos_product_price_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pos_product_price_logs"
    ADD CONSTRAINT "pos_product_price_logs_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "pos_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_product_price_logs"
    ADD CONSTRAINT "pos_product_price_logs_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "pos_product_price_logs_storeId_createdAt_idx"
    ON "pos_product_price_logs"("storeId", "createdAt");

CREATE INDEX "pos_product_price_logs_productId_createdAt_idx"
    ON "pos_product_price_logs"("productId", "createdAt");

CREATE INDEX "pos_product_price_logs_storeId_field_createdAt_idx"
    ON "pos_product_price_logs"("storeId", "field", "createdAt");
