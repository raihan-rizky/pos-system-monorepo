-- Trigram indexes for transaction history search.
--
-- GET /api/transactions filters with case-insensitive `contains` on the columns
-- below (invoice number, customer name, sales name, and item product name).
-- pos_products and pos_customers already have gin_trgm_ops indexes for the same
-- access pattern; pos_transactions and pos_transaction_items did not, so every
-- keyword search on the history page fell back to a sequential scan — on a page
-- that polls every 5 seconds.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ⚠ OPERATIONAL NOTE
-- Plain CREATE INDEX takes an ACCESS EXCLUSIVE lock, which blocks writes to the
-- table while the index builds. On pos_transaction_items (the largest table in
-- this schema) that means checkout is blocked for the duration.
--
-- If this is being applied to a live store, run the CONCURRENTLY variants
-- manually instead and mark this migration as applied:
--
--   CREATE INDEX CONCURRENTLY IF NOT EXISTS "pos_transactions_invoiceNumber_trgm_idx"
--     ON "pos_transactions" USING GIN ("invoiceNumber" gin_trgm_ops);
--   ... (same for the other three)
--   npx prisma migrate resolve --applied 20260727_transaction_search_trgm_indexes
--
-- CONCURRENTLY cannot run inside Prisma's migration transaction, which is why it
-- is not the default here.

CREATE INDEX IF NOT EXISTS "pos_transactions_invoiceNumber_trgm_idx"
  ON "pos_transactions" USING GIN ("invoiceNumber" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "pos_transactions_customerName_trgm_idx"
  ON "pos_transactions" USING GIN ("customerName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "pos_transactions_salesName_trgm_idx"
  ON "pos_transactions" USING GIN ("salesName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "pos_transaction_items_productName_trgm_idx"
  ON "pos_transaction_items" USING GIN ("productName" gin_trgm_ops);
