-- Add supplier code and product-level Harga Agen.
ALTER TABLE "pos_suppliers"
ADD COLUMN "code" TEXT;

ALTER TABLE "pos_products"
ADD COLUMN "hargaAgen" DECIMAL(12, 2);

CREATE UNIQUE INDEX "pos_suppliers_code_key"
ON "pos_suppliers"("code");

-- Link products to one or more suppliers.
CREATE TABLE "pos_product_suppliers" (
  "productId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pos_product_suppliers_pkey" PRIMARY KEY ("productId", "supplierId")
);

CREATE INDEX "pos_product_suppliers_supplierId_idx"
ON "pos_product_suppliers"("supplierId");

ALTER TABLE "pos_product_suppliers"
ADD CONSTRAINT "pos_product_suppliers_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "pos_products"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_product_suppliers"
ADD CONSTRAINT "pos_product_suppliers_supplierId_fkey"
FOREIGN KEY ("supplierId") REFERENCES "pos_suppliers"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
