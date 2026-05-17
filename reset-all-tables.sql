-- WARNING: This script will delete ALL ROWS in ALL TABLES mapped in your Prisma schema.
-- Use this only for local development or testing purposes to integrate with the store faster.
-- The CASCADE option ensures that foreign key constraints do not block the truncation.

TRUNCATE TABLE 
  "pos_transaction_items",
  "pos_inventory_logs",
  "pos_batch_operation_items",
  "pos_batch_operations",
  "pos_cashier_shifts",
  "pos_transactions",
  "pos_customers",
  "pos_salespersons",
  "pos_products",
  "pos_categories",
  "pos_push_subscriptions",
  "pos_role_permissions",
  "pos_users",
  "pos_stores",
  "StoreSettings",
  "chat_messages",
  "chat_messages_teladan",
  "chat_sessions",
  "chats",
  "documents",
  "papers_vectordb",
  "products_teladan",
  "receipts_teladan"
CASCADE;
