-- CreateEnum
CREATE TYPE "SuratJalanStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED');

-- AlterTable
ALTER TABLE "pos_transactions"
ADD COLUMN "stockManagedBySuratJalan" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "pos_surat_jalan" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL,
    "status" "SuratJalanStatus" NOT NULL DEFAULT 'PENDING',
    "sequence" INTEGER NOT NULL,
    "requestedById" TEXT,
    "requestedByName" TEXT,
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_surat_jalan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_surat_jalan_items" (
    "id" TEXT NOT NULL,
    "suratJalanId" TEXT NOT NULL,
    "transactionItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "keterangan" TEXT,
    "stockBefore" DOUBLE PRECISION,
    "stockAfter" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pos_surat_jalan_items_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "pos_inventory_logs"
ADD COLUMN "transactionId" TEXT,
ADD COLUMN "suratJalanId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pos_surat_jalan_number_key" ON "pos_surat_jalan"("number");

-- CreateIndex
CREATE UNIQUE INDEX "pos_surat_jalan_transactionId_sequence_key" ON "pos_surat_jalan"("transactionId", "sequence");

-- CreateIndex
CREATE INDEX "pos_surat_jalan_transactionId_status_idx" ON "pos_surat_jalan"("transactionId", "status");

-- CreateIndex
CREATE INDEX "pos_surat_jalan_storeId_createdAt_idx" ON "pos_surat_jalan"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "pos_surat_jalan_status_createdAt_idx" ON "pos_surat_jalan"("status", "createdAt");

-- CreateIndex
CREATE INDEX "pos_surat_jalan_items_suratJalanId_idx" ON "pos_surat_jalan_items"("suratJalanId");

-- CreateIndex
CREATE INDEX "pos_surat_jalan_items_transactionItemId_idx" ON "pos_surat_jalan_items"("transactionItemId");

-- CreateIndex
CREATE INDEX "pos_surat_jalan_items_productId_idx" ON "pos_surat_jalan_items"("productId");

-- CreateIndex
CREATE INDEX "pos_inventory_logs_transactionId_createdAt_idx" ON "pos_inventory_logs"("transactionId", "createdAt");

-- CreateIndex
CREATE INDEX "pos_inventory_logs_suratJalanId_createdAt_idx" ON "pos_inventory_logs"("suratJalanId", "createdAt");

-- AddForeignKey
ALTER TABLE "pos_surat_jalan"
ADD CONSTRAINT "pos_surat_jalan_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "pos_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_surat_jalan"
ADD CONSTRAINT "pos_surat_jalan_storeId_fkey"
FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_surat_jalan_items"
ADD CONSTRAINT "pos_surat_jalan_items_suratJalanId_fkey"
FOREIGN KEY ("suratJalanId") REFERENCES "pos_surat_jalan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_surat_jalan_items"
ADD CONSTRAINT "pos_surat_jalan_items_transactionItemId_fkey"
FOREIGN KEY ("transactionItemId") REFERENCES "pos_transaction_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_surat_jalan_items"
ADD CONSTRAINT "pos_surat_jalan_items_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "pos_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_inventory_logs"
ADD CONSTRAINT "pos_inventory_logs_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "pos_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_inventory_logs"
ADD CONSTRAINT "pos_inventory_logs_suratJalanId_fkey"
FOREIGN KEY ("suratJalanId") REFERENCES "pos_surat_jalan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
