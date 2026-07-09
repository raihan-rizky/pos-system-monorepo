/*
  Warnings:

  - The primary key for the `pos_push_subscriptions` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `pos_push_subscriptions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `userId` on the `pos_push_subscriptions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - You are about to alter the column `storeId` on the `pos_push_subscriptions` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(255)`.
  - Made the column `auth` on table `pos_push_subscriptions` required. This step will fail if there are existing NULL values in that column.
  - Made the column `p256dh` on table `pos_push_subscriptions` required. This step will fail if there are existing NULL values in that column.

*/
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "tender_status" AS ENUM ('draft', 'submitted', 'accepted', 'rejected', 'expired');

-- DropForeignKey
ALTER TABLE "pos_batch_operation_items" DROP CONSTRAINT "pos_batch_operation_items_productId_fkey";

-- DropForeignKey
ALTER TABLE "pos_product_price_logs" DROP CONSTRAINT "pos_product_price_logs_productId_fkey";

-- DropForeignKey
ALTER TABLE "pos_product_stock_group_activities" DROP CONSTRAINT "pos_product_stock_group_activities_productId_fkey";

-- DropForeignKey
ALTER TABLE "pos_shopping_request_items" DROP CONSTRAINT "pos_shopping_request_items_productId_fkey";

-- DropForeignKey
ALTER TABLE "pos_surat_jalan_items" DROP CONSTRAINT "pos_surat_jalan_items_productId_fkey";

-- DropForeignKey
ALTER TABLE "pos_transaction_items" DROP CONSTRAINT "pos_transaction_items_productId_fkey";

-- DropForeignKey
ALTER TABLE "pos_transactions" DROP CONSTRAINT "pos_transactions_cashierId_fkey";

-- DropIndex
DROP INDEX "pos_category_customer_pricing_rules_storeId_customerType_catego";

-- AlterTable
ALTER TABLE "pos_push_subscriptions" DROP CONSTRAINT "pos_push_subscriptions_pkey",
ADD COLUMN     "user_agent" TEXT,
ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
ALTER COLUMN "id" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "userId" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "storeId" SET DATA TYPE VARCHAR(255),
ALTER COLUMN "auth" SET NOT NULL,
ALTER COLUMN "p256dh" SET NOT NULL,
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMPTZ(6),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMPTZ(6),
ADD CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "pos_transaction_items" ADD COLUMN     "material" TEXT,
ADD COLUMN     "size" TEXT,
ADD COLUMN     "unitCost" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" BIGSERIAL NOT NULL,
    "session_id" UUID NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "meta" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "chat_id" UUID,
    "title" TEXT DEFAULT 'New Chat',

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages_teladan" (
    "id" BIGSERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "image_url" TEXT,

    CONSTRAINT "chat_messages_teladan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_key" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chats" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "session_id" UUID NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_active_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" BIGSERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "session_id" UUID,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "papers_vectordb" (
    "id" BIGSERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector,
    "metadata" JSONB DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "papers_vectordb_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products_teladan" (
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "unit" VARCHAR(50),
    "price" DECIMAL(15,2) NOT NULL,
    "category" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_teladan_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "receipts_teladan" (
    "id" BIGSERIAL NOT NULL,
    "transaction_id" VARCHAR(50) NOT NULL,
    "transaction_date" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "customer_name" VARCHAR(100),
    "item_name" VARCHAR(255) NOT NULL,
    "size" VARCHAR(50),
    "material" VARCHAR(50),
    "quantity" VARCHAR(50),
    "price_per_item" DECIMAL(15,2),
    "total_price" DECIMAL(15,2),
    "payment_method" VARCHAR(50),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "down_payment" DECIMAL,

    CONSTRAINT "receipts_teladan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sender_defense_teladan" (
    "phone" TEXT NOT NULL,
    "is_blocked" BOOLEAN DEFAULT false,
    "abuse_count" INTEGER DEFAULT 0,
    "last_abuse_at" TIMESTAMPTZ(6),
    "last_seen_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "blocked_at" TIMESTAMPTZ(6),
    "block_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sender_defense_teladan_pkey" PRIMARY KEY ("phone")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contact_name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "negotiations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "chat_id" TEXT NOT NULL,
    "customer_name" TEXT,
    "last_offer_price" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "last_offer_message_id" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "negotiations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "specification" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "image_path" TEXT,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_offers" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "offer_date" DATE NOT NULL,
    "tender_reference" TEXT,
    "offered_price" DECIMAL(14,2),
    "quantity" DECIMAL(14,2),
    "currency" TEXT NOT NULL DEFAULT 'THB',
    "status" "tender_status" NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tender_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waha_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_name" TEXT NOT NULL,
    "chat_id" TEXT,
    "message_id" TEXT,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waha_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_messages_chat_created_idx" ON "chat_messages"("chat_id", "created_at");

-- CreateIndex
CREATE INDEX "chat_messages_session_created_idx" ON "chat_messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_chat_messages_phone" ON "chat_messages_teladan"("phone", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_chat_messages_teladan_phone" ON "chat_messages_teladan"("phone", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_session_key_key" ON "chat_sessions"("session_key");

-- CreateIndex
CREATE INDEX "chat_sessions_last_active_idx" ON "chat_sessions"("last_active_at" DESC);

-- CreateIndex
CREATE INDEX "chats_session_last_active_idx" ON "chats"("session_id", "last_active_at" DESC);

-- CreateIndex
CREATE INDEX "documents_embedding_idx" ON "documents"("embedding");

-- CreateIndex
CREATE INDEX "documents_session_idx" ON "documents"("session_id");

-- CreateIndex
CREATE INDEX "papers_vectordb_embedding_idx" ON "papers_vectordb"("embedding");

-- CreateIndex
CREATE INDEX "idx_products_code" ON "products_teladan"("code");

-- CreateIndex
CREATE INDEX "idx_receipts_date" ON "receipts_teladan"("transaction_date" DESC);

-- CreateIndex
CREATE INDEX "idx_receipts_transaction_id" ON "receipts_teladan"("transaction_id");

-- CreateIndex
CREATE INDEX "idx_chat_sender_defense_phone" ON "chat_sender_defense_teladan"("phone");

-- CreateIndex
CREATE INDEX "companies_user_id_idx" ON "companies"("user_id");

-- CreateIndex
CREATE INDEX "companies_user_id_name_idx" ON "companies"("user_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "negotiations_chat_id_key" ON "negotiations"("chat_id");

-- CreateIndex
CREATE INDEX "idx_negotiations_status" ON "negotiations"("status");

-- CreateIndex
CREATE INDEX "products_user_id_idx" ON "products"("user_id");

-- CreateIndex
CREATE INDEX "products_user_id_name_idx" ON "products"("user_id", "name");

-- CreateIndex
CREATE INDEX "tender_offers_company_id_idx" ON "tender_offers"("company_id");

-- CreateIndex
CREATE INDEX "tender_offers_product_id_offer_date_idx" ON "tender_offers"("product_id", "offer_date" DESC);

-- CreateIndex
CREATE INDEX "tender_offers_user_id_idx" ON "tender_offers"("user_id");

-- CreateIndex
CREATE INDEX "idx_waha_events_chat_id_created_at" ON "waha_events"("chat_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "pos_product_stock_group_activities" ADD CONSTRAINT "pos_product_stock_group_activities_productId_fkey" FOREIGN KEY ("productId") REFERENCES "pos_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_transactions" ADD CONSTRAINT "pos_transactions_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "pos_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_transaction_items" ADD CONSTRAINT "pos_transaction_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "pos_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_surat_jalan_items" ADD CONSTRAINT "pos_surat_jalan_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "pos_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_shopping_request_items" ADD CONSTRAINT "pos_shopping_request_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "pos_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_product_price_logs" ADD CONSTRAINT "pos_product_price_logs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "pos_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pos_batch_operation_items" ADD CONSTRAINT "pos_batch_operation_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "pos_products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "chats" ADD CONSTRAINT "chats_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "tender_offers" ADD CONSTRAINT "tender_offers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_offers" ADD CONSTRAINT "tender_offers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "pos_inventory_log_correction_movements_correctionRequestId_kind" RENAME TO "pos_inventory_log_correction_movements_correctionRequestId__idx";

-- RenameIndex
ALTER INDEX "pos_inventory_log_correction_requests_inventoryLogId_status_cre" RENAME TO "pos_inventory_log_correction_requests_inventoryLogId_status_idx";

-- RenameIndex
ALTER INDEX "pos_inventory_log_correction_requests_storeId_status_createdAt_" RENAME TO "pos_inventory_log_correction_requests_storeId_status_create_idx";

-- RenameIndex
ALTER INDEX "pos_inventory_task_checklist_items_completedById_completedAt_id" RENAME TO "pos_inventory_task_checklist_items_completedById_completedA_idx";
