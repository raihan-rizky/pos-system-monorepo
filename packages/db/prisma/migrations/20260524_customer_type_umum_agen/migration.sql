-- Remap legacy customer type values to the new two-value enum.
ALTER TYPE "CustomerType" RENAME TO "CustomerType_old";

CREATE TYPE "CustomerType" AS ENUM ('UMUM', 'AGEN');

ALTER TABLE "pos_customers"
  ALTER COLUMN "type" DROP DEFAULT;

ALTER TABLE "pos_customers"
  ALTER COLUMN "type"
  TYPE "CustomerType"
  USING (
    CASE
      WHEN "type"::text = 'REGULAR' THEN 'UMUM'
      WHEN "type"::text = 'VIP' THEN 'AGEN'
      WHEN "type"::text = 'CORPORATE' THEN 'AGEN'
      ELSE 'UMUM'
    END
  )::"CustomerType";

ALTER TABLE "pos_customers"
  ALTER COLUMN "type" SET DEFAULT 'UMUM';

DROP TYPE "CustomerType_old";
