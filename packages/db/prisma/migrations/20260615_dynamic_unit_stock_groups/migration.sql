-- Dynamic unit-based shared stock groups.

CREATE TABLE "pos_product_stock_groups" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "groupKey" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "baseUnit" TEXT NOT NULL DEFAULT 'pcs',
  "baseStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pos_product_stock_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pos_product_stock_group_activities" (
  "id" TEXT NOT NULL,
  "stockGroupId" TEXT NOT NULL,
  "productId" TEXT,
  "type" TEXT NOT NULL,
  "note" TEXT,
  "createdBy" TEXT,
  "person" TEXT,
  "before" JSONB,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pos_product_stock_group_activities_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pos_products"
  ADD COLUMN "stockGroupId" TEXT,
  ADD COLUMN "unitMultiplierToBase" DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN "conversionNeedsReview" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "pos_product_stock_groups_storeId_groupKey_key"
  ON "pos_product_stock_groups"("storeId", "groupKey");

CREATE INDEX "pos_product_stock_groups_storeId_idx"
  ON "pos_product_stock_groups"("storeId");

CREATE INDEX "pos_product_stock_groups_storeId_groupKey_idx"
  ON "pos_product_stock_groups"("storeId", "groupKey");

CREATE INDEX "pos_products_stockGroupId_idx"
  ON "pos_products"("stockGroupId");

CREATE INDEX "pos_product_stock_group_activities_stockGroupId_createdAt_idx"
  ON "pos_product_stock_group_activities"("stockGroupId", "createdAt");

CREATE INDEX "pos_product_stock_group_activities_stockGroupId_type_createdAt_idx"
  ON "pos_product_stock_group_activities"("stockGroupId", "type", "createdAt");

CREATE INDEX "pos_product_stock_group_activities_productId_idx"
  ON "pos_product_stock_group_activities"("productId");

ALTER TABLE "pos_product_stock_groups"
  ADD CONSTRAINT "pos_product_stock_groups_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "pos_stores"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pos_products"
  ADD CONSTRAINT "pos_products_stockGroupId_fkey"
  FOREIGN KEY ("stockGroupId") REFERENCES "pos_product_stock_groups"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "pos_product_stock_group_activities"
  ADD CONSTRAINT "pos_product_stock_group_activities_stockGroupId_fkey"
  FOREIGN KEY ("stockGroupId") REFERENCES "pos_product_stock_groups"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pos_product_stock_group_activities"
  ADD CONSTRAINT "pos_product_stock_group_activities_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "pos_products"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

WITH normalized AS (
  SELECT
    p."id",
    p."storeId",
    p."name",
    p."categoryId",
    p."material",
    p."size",
    p."unit",
    p."stock",
    p."createdAt",
    concat_ws(
      '|',
      regexp_replace(lower(trim(p."name")), '\s+', ' ', 'g'),
      p."categoryId",
      regexp_replace(lower(trim(coalesce(p."material", ''))), '\s+', ' ', 'g'),
      regexp_replace(lower(trim(coalesce(p."size", ''))), '\s+', ' ', 'g')
    ) AS "groupKey"
  FROM "pos_products" p
  WHERE p."isActive" = true
),
ranked AS (
  SELECT
    n.*,
    row_number() OVER (
      PARTITION BY n."storeId", n."groupKey"
      ORDER BY n."createdAt" ASC, n."id" ASC
    ) AS rn
  FROM normalized n
),
groups AS (
  SELECT
    concat('psg_', md5(r."storeId" || ':' || r."groupKey")) AS "id",
    r."storeId",
    r."groupKey",
    r."name" AS "displayName",
    r."unit" AS "baseUnit",
    r."stock" AS "baseStock"
  FROM ranked r
  WHERE r.rn = 1
)
INSERT INTO "pos_product_stock_groups" (
  "id",
  "storeId",
  "groupKey",
  "displayName",
  "baseUnit",
  "baseStock",
  "createdAt",
  "updatedAt"
)
SELECT
  g."id",
  g."storeId",
  g."groupKey",
  g."displayName",
  g."baseUnit",
  g."baseStock",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM groups g
ON CONFLICT ("storeId", "groupKey") DO NOTHING;

WITH normalized AS (
  SELECT
    p."id",
    p."storeId",
    concat_ws(
      '|',
      regexp_replace(lower(trim(p."name")), '\s+', ' ', 'g'),
      p."categoryId",
      regexp_replace(lower(trim(coalesce(p."material", ''))), '\s+', ' ', 'g'),
      regexp_replace(lower(trim(coalesce(p."size", ''))), '\s+', ' ', 'g')
    ) AS "groupKey"
  FROM "pos_products" p
  WHERE p."isActive" = true
),
ranked AS (
  SELECT
    n.*,
    row_number() OVER (
      PARTITION BY n."storeId", n."groupKey"
      ORDER BY (SELECT p."createdAt" FROM "pos_products" p WHERE p."id" = n."id") ASC, n."id" ASC
    ) AS rn
  FROM normalized n
)
UPDATE "pos_products" p
SET
  "stockGroupId" = g."id",
  "unitMultiplierToBase" = 1,
  "conversionNeedsReview" = ranked.rn <> 1
FROM ranked
JOIN "pos_product_stock_groups" g
  ON g."storeId" = ranked."storeId"
  AND g."groupKey" = ranked."groupKey"
WHERE p."id" = ranked."id";
