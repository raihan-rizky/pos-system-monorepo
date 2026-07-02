-- Baseline for the POS schema that existed before the tracked RBAC migration.
-- Keep this migration idempotent so existing Supabase databases can record it
-- without recreating objects that were already present before Prisma Migrate
-- started tracking this project.

DO $$
BEGIN
  CREATE TYPE "Role" AS ENUM ('OWNER', 'MANAGER', 'CASHIER', 'ADMIN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'DEBIT', 'CREDIT', 'QRIS', 'TRANSFER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "TransactionStatus" AS ENUM ('COMPLETED', 'VOIDED', 'REFUNDED', 'DP');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "InventoryType" AS ENUM ('IN', 'OUT', 'ADJUSTMENT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ProductionStatus" AS ENUM (
    'PENDING',
    'DESIGNING',
    'PRINTING',
    'FINISHING',
    'READY_PICKUP',
    'DELIVERED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "CustomerType" AS ENUM ('UMUM', 'AGEN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "pos_stores" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "phone" TEXT,
  "logoUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pos_stores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pos_users" (
  "id" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'CASHIER',
  "password" TEXT,
  "avatarUrl" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "storeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pos_users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_users_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "pos_users_username_key" ON "pos_users"("username");

CREATE TABLE IF NOT EXISTS "pos_categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "icon" TEXT,
  "color" TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "pos_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pos_categories_name_key" ON "pos_categories"("name");

CREATE TABLE IF NOT EXISTS "pos_customers" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "email" TEXT,
  "company" TEXT,
  "address" TEXT,
  "type" "CustomerType" NOT NULL DEFAULT 'UMUM',
  "notes" TEXT,
  "totalSpent" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalOrders" INTEGER NOT NULL DEFAULT 0,
  "loyaltyPoint" INTEGER NOT NULL DEFAULT 0,
  "lastVisitAt" TIMESTAMP(3),
  "storeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "totalDebt" DECIMAL(12,2) NOT NULL DEFAULT 0,

  CONSTRAINT "pos_customers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_customers_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "pos_customers_storeId_idx" ON "pos_customers"("storeId");
CREATE INDEX IF NOT EXISTS "pos_customers_phone_idx" ON "pos_customers"("phone");
CREATE INDEX IF NOT EXISTS "pos_customers_type_idx" ON "pos_customers"("type");

CREATE TABLE IF NOT EXISTS "pos_salespersons" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "storeId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pos_salespersons_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_salespersons_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "pos_salespersons_storeId_idx" ON "pos_salespersons"("storeId");

CREATE TABLE IF NOT EXISTS "pos_products" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "barcode" TEXT,
  "description" TEXT,
  "price" DECIMAL(12,2) NOT NULL,
  "costPrice" DECIMAL(12,2),
  "stock" INTEGER NOT NULL DEFAULT 0,
  "minStock" INTEGER NOT NULL DEFAULT 5,
  "unit" TEXT NOT NULL DEFAULT 'pcs',
  "categoryId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "imageUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "material" TEXT,
  "size" TEXT,

  CONSTRAINT "pos_products_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_products_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "pos_categories"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pos_products_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "pos_products_sku_key" ON "pos_products"("sku");
CREATE INDEX IF NOT EXISTS "pos_products_categoryId_idx" ON "pos_products"("categoryId");
CREATE INDEX IF NOT EXISTS "pos_products_storeId_idx" ON "pos_products"("storeId");
CREATE INDEX IF NOT EXISTS "pos_products_sku_idx" ON "pos_products"("sku");

CREATE TABLE IF NOT EXISTS "pos_transactions" (
  "id" TEXT NOT NULL,
  "invoiceNumber" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "cashierId" TEXT NOT NULL,
  "subtotal" DECIMAL(12,2) NOT NULL,
  "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(12,2) NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
  "amountPaid" DECIMAL(12,2) NOT NULL,
  "change" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "status" "TransactionStatus" NOT NULL DEFAULT 'COMPLETED',
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "customerName" TEXT,
  "salesName" TEXT,
  "salespersonId" TEXT,
  "estimatedDoneAt" TIMESTAMP(3),
  "isJobOrder" BOOLEAN NOT NULL DEFAULT false,
  "productionStatus" "ProductionStatus",
  "customerId" TEXT,

  CONSTRAINT "pos_transactions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_transactions_cashierId_fkey"
    FOREIGN KEY ("cashierId") REFERENCES "pos_users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pos_transactions_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "pos_customers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "pos_transactions_salespersonId_fkey"
    FOREIGN KEY ("salespersonId") REFERENCES "pos_salespersons"("id")
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "pos_transactions_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "pos_transactions_invoiceNumber_key"
  ON "pos_transactions"("invoiceNumber");
CREATE INDEX IF NOT EXISTS "pos_transactions_storeId_idx" ON "pos_transactions"("storeId");
CREATE INDEX IF NOT EXISTS "pos_transactions_cashierId_idx" ON "pos_transactions"("cashierId");
CREATE INDEX IF NOT EXISTS "pos_transactions_customerId_idx" ON "pos_transactions"("customerId");
CREATE INDEX IF NOT EXISTS "pos_transactions_salespersonId_idx" ON "pos_transactions"("salespersonId");
CREATE INDEX IF NOT EXISTS "pos_transactions_createdAt_idx" ON "pos_transactions"("createdAt");

CREATE TABLE IF NOT EXISTS "pos_transaction_items" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "subtotal" DECIMAL(12,2) NOT NULL,

  CONSTRAINT "pos_transaction_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_transaction_items_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "pos_products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "pos_transaction_items_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "pos_transactions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "pos_transaction_items_transactionId_idx"
  ON "pos_transaction_items"("transactionId");
CREATE INDEX IF NOT EXISTS "pos_transaction_items_productId_idx"
  ON "pos_transaction_items"("productId");

CREATE TABLE IF NOT EXISTS "pos_transaction_payments" (
  "id" TEXT NOT NULL,
  "transactionId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pos_transaction_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_transaction_payments_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "pos_transactions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "pos_transaction_payments_transactionId_idx"
  ON "pos_transaction_payments"("transactionId");

CREATE TABLE IF NOT EXISTS "pos_inventory_logs" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "type" "InventoryType" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "note" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pos_inventory_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_inventory_logs_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "pos_products"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "pos_inventory_logs_productId_idx"
  ON "pos_inventory_logs"("productId");
CREATE INDEX IF NOT EXISTS "pos_inventory_logs_createdAt_idx"
  ON "pos_inventory_logs"("createdAt");

CREATE TABLE IF NOT EXISTS "pos_cashier_shifts" (
  "id" TEXT NOT NULL,
  "cashierId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "openingBalance" DECIMAL(12,2) NOT NULL,
  "closingBalance" DECIMAL(12,2),
  "expectedBalance" DECIMAL(12,2),
  "discrepancy" DECIMAL(12,2),
  "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
  "note" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),

  CONSTRAINT "pos_cashier_shifts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pos_cashier_shifts_cashierId_fkey"
    FOREIGN KEY ("cashierId") REFERENCES "pos_users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "pos_cashier_shifts_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "pos_cashier_shifts_cashierId_idx"
  ON "pos_cashier_shifts"("cashierId");
CREATE INDEX IF NOT EXISTS "pos_cashier_shifts_storeId_idx"
  ON "pos_cashier_shifts"("storeId");
CREATE INDEX IF NOT EXISTS "pos_cashier_shifts_status_idx"
  ON "pos_cashier_shifts"("status");

CREATE TABLE IF NOT EXISTS "StoreSettings" (
  "id" TEXT NOT NULL DEFAULT 'store-main',
  "name" TEXT NOT NULL DEFAULT '',
  "address" TEXT NOT NULL DEFAULT '',
  "phone" TEXT NOT NULL DEFAULT '',
  "logoUrl" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StoreSettings_pkey" PRIMARY KEY ("id")
);
