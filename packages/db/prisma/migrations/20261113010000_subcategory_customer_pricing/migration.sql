-- Keep subcategory rules separate from legacy category rules so older runtimes cannot apply them.
CREATE TABLE IF NOT EXISTS "pos_subcategory_customer_pricing_rules" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "subcategoryId" TEXT NOT NULL,
  "customerType" "CustomerType",
  "customerTypes" "CustomerType"[] NOT NULL DEFAULT ARRAY[]::"CustomerType"[],
  "unit" TEXT,
  "units" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "brandId" TEXT,
  "mode" "CategoryCustomerPricingMode" NOT NULL,
  "value" DECIMAL(12,2) NOT NULL,
  "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pos_subcategory_customer_pricing_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_subcategory_customer_pricing_rules_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pos_subcategory_customer_pricing_rules_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "pos_product_subcategories"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pos_subcategory_customer_pricing_rules_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "pos_brands"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "pos_subcategory_customer_pricing_rules_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "pos_users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "pos_subcategory_customer_pricing_rules_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "pos_users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "pos_subcategory_customer_pricing_rules_storeId_isActive_idx" ON "pos_subcategory_customer_pricing_rules"("storeId", "isActive");
CREATE INDEX IF NOT EXISTS "pos_subcategory_customer_pricing_rules_subcategoryId_idx" ON "pos_subcategory_customer_pricing_rules"("subcategoryId");
CREATE INDEX IF NOT EXISTS "pos_subcategory_customer_pricing_rules_brandId_idx" ON "pos_subcategory_customer_pricing_rules"("brandId");

-- Pricing rules are read and changed only through authorized server APIs.
ALTER TABLE "pos_subcategory_customer_pricing_rules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "pos_subcategory_customer_pricing_rules" FROM PUBLIC;
DO $security$
DECLARE api_role TEXT;
BEGIN
  FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') LOOP
    EXECUTE format('REVOKE ALL ON TABLE "pos_subcategory_customer_pricing_rules" FROM %I', api_role);
  END LOOP;
END $security$;
