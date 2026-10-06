CREATE TYPE "ProductSalesGroup" AS ENUM ('ATK', 'PAPER', 'CARTRIDGE', 'INK', 'OTHER');

ALTER TABLE "pos_categories"
  ADD COLUMN "salesGroup" "ProductSalesGroup" NOT NULL DEFAULT 'OTHER';

UPDATE "pos_categories"
SET "salesGroup" = 'ATK'
WHERE "salesGroup" = 'OTHER'
  AND lower(btrim("name")) IN ('atk', 'stationery');

UPDATE "pos_categories"
SET "salesGroup" = 'PAPER'
WHERE "salesGroup" = 'OTHER'
  AND lower(btrim("name")) IN ('kertas', 'paper');

UPDATE "pos_categories"
SET "salesGroup" = 'CARTRIDGE'
WHERE "salesGroup" = 'OTHER'
  AND lower(btrim("name")) ~ '^(cartridge|catridge|cardridge)(\s|$)';

UPDATE "pos_categories"
SET "salesGroup" = 'INK'
WHERE "salesGroup" = 'OTHER'
  AND lower(btrim("name")) IN ('tinta', 'tinta printing', 'ink');
