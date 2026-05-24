-- Ensure browser push subscriptions have an explicit, migration-backed table.
-- Earlier environments may have received this table through db push/manual SQL,
-- which can leave production drifted from the Prisma model.

CREATE TABLE IF NOT EXISTS "pos_push_subscriptions" (
  "id" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" "Role" NOT NULL,
  "storeId" TEXT,
  "auth" TEXT,
  "p256dh" TEXT,
  "features" JSONB,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "pos_push_subscriptions"
  ADD COLUMN IF NOT EXISTS "id" TEXT,
  ADD COLUMN IF NOT EXISTS "endpoint" TEXT,
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "role" "Role",
  ADD COLUMN IF NOT EXISTS "storeId" TEXT,
  ADD COLUMN IF NOT EXISTS "auth" TEXT,
  ADD COLUMN IF NOT EXISTS "p256dh" TEXT,
  ADD COLUMN IF NOT EXISTS "features" JSONB,
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;

DO $$
DECLARE
  trigger_record RECORD;
BEGIN
  FOR trigger_record IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = '"pos_push_subscriptions"'::regclass
      AND NOT tgisinternal
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON "pos_push_subscriptions"',
      trigger_record.tgname
    );
  END LOOP;
END $$;

ALTER TABLE "pos_push_subscriptions"
  ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "pos_push_subscriptions"
  ALTER COLUMN "role" TYPE "Role"
  USING (
    CASE
      WHEN "role"::text IN ('OWNER', 'ADMIN', 'CASHIER', 'SALES')
        THEN "role"::text::"Role"
      ELSE 'OWNER'::"Role"
    END
  );

UPDATE "pos_push_subscriptions"
SET
  "id" = COALESCE("id", 'push_' || md5(random()::text || clock_timestamp()::text)),
  "endpoint" = COALESCE("endpoint", 'missing-endpoint-' || md5(random()::text || clock_timestamp()::text)),
  "userId" = COALESCE("userId", 'unknown-user'),
  "role" = COALESCE("role", 'OWNER'::"Role"),
  "isActive" = COALESCE("isActive", true),
  "createdAt" = COALESCE("createdAt", CURRENT_TIMESTAMP),
  "updatedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP);

WITH duplicate_ids AS (
  SELECT ctid
  FROM (
    SELECT
      ctid,
      ROW_NUMBER() OVER (
        PARTITION BY "id"
        ORDER BY "updatedAt" DESC NULLS LAST, ctid DESC
      ) AS row_number
    FROM "pos_push_subscriptions"
  ) ranked
  WHERE row_number > 1
)
UPDATE "pos_push_subscriptions" subscriptions
SET "id" = 'push_' || md5(random()::text || clock_timestamp()::text)
FROM duplicate_ids
WHERE subscriptions.ctid = duplicate_ids.ctid;

WITH duplicate_endpoints AS (
  SELECT ctid
  FROM (
    SELECT
      ctid,
      ROW_NUMBER() OVER (
        PARTITION BY "endpoint"
        ORDER BY "updatedAt" DESC NULLS LAST, ctid DESC
      ) AS row_number
    FROM "pos_push_subscriptions"
  ) ranked
  WHERE row_number > 1
)
UPDATE "pos_push_subscriptions" subscriptions
SET
  "endpoint" = 'duplicate-endpoint-' || md5(random()::text || clock_timestamp()::text),
  "isActive" = false
FROM duplicate_endpoints
WHERE subscriptions.ctid = duplicate_endpoints.ctid;

ALTER TABLE "pos_push_subscriptions"
  ALTER COLUMN "id" SET NOT NULL,
  ALTER COLUMN "endpoint" SET NOT NULL,
  ALTER COLUMN "userId" SET NOT NULL,
  ALTER COLUMN "role" SET NOT NULL,
  ALTER COLUMN "isActive" SET NOT NULL,
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "updatedAt" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE contype = 'p'
      AND conrelid = '"pos_push_subscriptions"'::regclass
  ) THEN
    ALTER TABLE "pos_push_subscriptions"
      ADD CONSTRAINT "pos_push_subscriptions_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "pos_push_subscriptions_endpoint_key"
  ON "pos_push_subscriptions"("endpoint");

CREATE INDEX IF NOT EXISTS "pos_push_subscriptions_userId_idx"
  ON "pos_push_subscriptions"("userId");

CREATE INDEX IF NOT EXISTS "pos_push_subscriptions_storeId_idx"
  ON "pos_push_subscriptions"("storeId");

CREATE INDEX IF NOT EXISTS "pos_push_subscriptions_role_idx"
  ON "pos_push_subscriptions"("role");
