CREATE SCHEMA IF NOT EXISTS comparison_integration;
SET search_path TO comparison_integration;
DO $$ BEGIN CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'CASHIER', 'SALES', 'INVENTORY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'DEBIT', 'CREDIT', 'QRIS', 'TRANSFER', 'TEMPO'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS "pos_stores" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "address" TEXT, "phone" TEXT, "logoUrl" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE IF NOT EXISTS "pos_users" ("id" TEXT PRIMARY KEY, "username" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "role" "Role" NOT NULL DEFAULT 'CASHIER', "password" TEXT, "avatarUrl" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "storeId" TEXT REFERENCES "pos_stores"("id"), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE IF NOT EXISTS "pos_role_permissions" ("id" TEXT PRIMARY KEY, "role" "Role" NOT NULL, "scope" TEXT NOT NULL, "target" TEXT NOT NULL, "action" TEXT NOT NULL, "allowed" BOOLEAN NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, UNIQUE ("role", "scope", "target", "action"));
