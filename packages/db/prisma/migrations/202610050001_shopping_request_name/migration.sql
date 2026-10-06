ALTER TABLE "pos_shopping_requests"
  ADD COLUMN "name" TEXT,
  ADD COLUMN "normalizedName" TEXT;

UPDATE "pos_shopping_requests"
SET "name" = "number",
    "normalizedName" = lower(btrim("number"));

DO $$
DECLARE
  duplicate_row RECORD;
  candidate TEXT;
  suffix INTEGER;
BEGIN
  FOR duplicate_row IN
    SELECT id, "storeId", "number"
    FROM (
      SELECT
        id,
        "storeId",
        "number",
        row_number() OVER (
          PARTITION BY "storeId", "normalizedName"
          ORDER BY id
        ) AS rank
      FROM "pos_shopping_requests"
    ) ranked
    WHERE rank > 1
  LOOP
    suffix := 0;
    LOOP
      candidate := duplicate_row."number" || ' #' || duplicate_row.id ||
        CASE WHEN suffix = 0 THEN '' ELSE '-' || suffix::text END;
      EXIT WHEN NOT EXISTS (
        SELECT 1
        FROM "pos_shopping_requests"
        WHERE "storeId" = duplicate_row."storeId"
          AND id <> duplicate_row.id
          AND "normalizedName" = lower(btrim(candidate))
      );
      suffix := suffix + 1;
    END LOOP;

    UPDATE "pos_shopping_requests"
    SET "name" = candidate,
        "normalizedName" = lower(btrim(candidate))
    WHERE id = duplicate_row.id;
  END LOOP;
END $$;

ALTER TABLE "pos_shopping_requests"
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "normalizedName" SET NOT NULL;

CREATE UNIQUE INDEX "pos_shopping_requests_storeId_normalizedName_key"
  ON "pos_shopping_requests"("storeId", "normalizedName");
